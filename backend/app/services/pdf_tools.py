from typing import List, Optional, Dict, Tuple
import io
import math
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
import logging
from pathlib import Path
from contextlib import contextmanager
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image
import pikepdf
import fitz  # PyMuPDF
from pytesseract import image_to_string
from pptx import Presentation

# Configure logger
logger = logging.getLogger(__name__)


def _editor_color(value: str, fallback: str = "#333333") -> Tuple[float, float, float]:
    color = value if isinstance(value, str) and len(value) == 7 and value.startswith("#") else fallback
    return tuple(int(color[index:index + 2], 16) / 255 for index in (1, 3, 5))


def _find_soffice() -> str:
    candidates = [
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        os.path.join(os.environ.get("PROGRAMFILES", ""), "LibreOffice", "program", "soffice.exe"),
        os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "LibreOffice", "program", "soffice.exe"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    raise ValueError("LibreOffice is required for PowerPoint conversion. Install it and restart MyPDF.")


def _powerpoint_to_pdf_macos(source_path: Path, pdf_path: Path) -> None:
    """Use an installed Microsoft PowerPoint app for native macOS PDF export."""
    powerpoint_app = Path("/Applications/Microsoft PowerPoint.app")
    if not powerpoint_app.is_dir():
        raise ValueError("Microsoft PowerPoint or LibreOffice is required for PowerPoint conversion")
    script = [
        "on run argv",
        "set inputFile to POSIX file (item 1 of argv)",
        "set outputFile to POSIX file (item 2 of argv)",
        'tell application "Microsoft PowerPoint"',
        "open inputFile",
        "save active presentation in outputFile as save as PDF",
        "close active presentation saving no",
        "end tell",
        "end run",
    ]
    command = ["/usr/bin/osascript"]
    for line in script:
        command.extend(["-e", line])
    command.extend([str(source_path), str(pdf_path)])
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=180, check=False)
    except subprocess.TimeoutExpired as error:
        raise ValueError("Microsoft PowerPoint export timed out") from error
    if result.returncode != 0 or not pdf_path.exists():
        detail = (result.stderr or result.stdout or "Unknown Microsoft PowerPoint error").strip()
        raise ValueError(f"Microsoft PowerPoint export failed: {detail}")


def powerpoint_to_pdf_bytes(file_data: bytes, filename: str, quality: str = "electronic") -> bytes:
    """Render a PowerPoint presentation to PDF using local LibreOffice."""
    if quality not in {"electronic", "print"}:
        raise ValueError("PowerPoint PDF quality must be electronic or print")
    suffix = Path(filename).suffix.lower()
    if suffix not in {".ppt", ".pptx"}:
        raise ValueError("PowerPoint file must use the .ppt or .pptx extension")

    with tempfile.TemporaryDirectory(prefix="mypdf-ppt-") as temp_dir:
        source_path = Path(temp_dir) / f"presentation{suffix}"
        source_path.write_bytes(file_data)
        pdf_path = source_path.with_suffix(".pdf")
        if sys.platform == "darwin" and Path("/Applications/Microsoft PowerPoint.app").is_dir():
            _powerpoint_to_pdf_macos(source_path, pdf_path)
            exported = pdf_path.read_bytes()
            return compress_pdf_bytes(exported, "medium") if quality == "electronic" else exported

        if quality == "electronic":
            pdf_filter = 'pdf:impress_pdf_Export:{"Quality":{"type":"long","value":"85"},"ReduceImageResolution":{"type":"boolean","value":"true"},"MaxImageResolution":{"type":"long","value":"150"}}'
        else:
            pdf_filter = 'pdf:impress_pdf_Export:{"Quality":{"type":"long","value":"100"},"ReduceImageResolution":{"type":"boolean","value":"false"}}'

        try:
            result = subprocess.run(
                [_find_soffice(), "--headless", "--convert-to", pdf_filter, "--outdir", temp_dir, str(source_path)],
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise ValueError("PowerPoint conversion timed out") from error

        if result.returncode != 0 or not pdf_path.exists():
            detail = (result.stderr or result.stdout or "Unknown LibreOffice error").strip()
            raise ValueError(f"PowerPoint conversion failed: {detail}")
        return pdf_path.read_bytes()


def powerpoint_to_flattened_pptx_bytes(file_data: bytes, filename: str) -> bytes:
    """Create a PPTX whose slides are full-page images of the source slides."""
    pdf_data = powerpoint_to_pdf_bytes(file_data, filename, "print")
    with fitz.open(stream=pdf_data, filetype="pdf") as document:
        if document.page_count == 0:
            raise ValueError("PowerPoint presentation contains no slides")

        first_page = document[0]
        presentation = Presentation()
        presentation.slide_width = int(first_page.rect.width / 72 * 914400)
        presentation.slide_height = int(first_page.rect.height / 72 * 914400)
        blank_layout = presentation.slide_layouts[6]

        with tempfile.TemporaryDirectory(prefix="mypdf-ppt-images-") as temp_dir:
            for index, page in enumerate(document):
                image_path = Path(temp_dir) / f"slide-{index + 1}.png"
                page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False).save(str(image_path))
                slide = presentation.slides.add_slide(blank_layout)
                slide.shapes.add_picture(
                    str(image_path),
                    0,
                    0,
                    width=presentation.slide_width,
                    height=presentation.slide_height,
                )

            output = io.BytesIO()
            presentation.save(output)
            return output.getvalue()

# Helper to ensure fonts
try:
    pdfmetrics.registerFont(TTFont('Helvetica', 'Helvetica.ttf'))
except Exception:
    pass


@contextmanager
def safe_fitz_document(file_data: bytes):
    """Context manager to safely open and close a PyMuPDF document.

    Yields:
        fitz.Document: opened document instance
    """
    doc = None
    try:
        doc = fitz.open(stream=file_data, filetype="pdf")
        yield doc
    except Exception as e:
        logger.error(f"Failed to open PDF with PyMuPDF: {e}")
        raise
    finally:
        if doc is not None:
            try:
                doc.close()
            except Exception as e:
                logger.warning(f"Failed to close PyMuPDF document: {e}")


@contextmanager
def safe_pikepdf_document(file_data: bytes):
    """Context manager to safely open and close a pikepdf document.

    Yields:
        pikepdf.Pdf: opened pikepdf document
    """
    pdf = None
    try:
        pdf = pikepdf.open(io.BytesIO(file_data))
        yield pdf
    except Exception as e:
        logger.error(f"Failed to open PDF with pikepdf: {e}")
        raise
    finally:
        if pdf is not None:
            try:
                pdf.close()
            except Exception as e:
                logger.warning(f"Failed to close pikepdf document: {e}")


def validate_pdf_data(file_data: bytes, allow_encrypted: bool = False) -> None:
    """Validate that the provided bytes represent a non-empty PDF file.

    Raises ValueError on invalid or empty data.
    """
    if not file_data:
        raise ValueError("Empty PDF data")
    
    try:
        # Try to read with PyPDF2 to validate PDF format
        reader = PdfReader(io.BytesIO(file_data))
        if reader.is_encrypted:
            if allow_encrypted:
                return
            raise ValueError("PDF is encrypted")
        if len(reader.pages) == 0:
            raise ValueError("PDF contains no pages")
    except Exception as e:
        raise ValueError(f"Invalid PDF format: {e}")


def merge_pdfs_bytes(files_data: List[bytes]) -> bytes:
    """Merge multiple PDF files provided as bytes and return merged PDF as bytes."""
    if not files_data:
        raise ValueError("No PDF files provided")
    
    for i, data in enumerate(files_data):
        try:
            validate_pdf_data(data)
        except ValueError as e:
            raise ValueError(f"Invalid PDF file {i+1}: {e}")
    
    try:
        writer = PdfWriter()
        for data in files_data:
            reader = PdfReader(io.BytesIO(data))
            for page in reader.pages:
                writer.add_page(page)
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"PDF merge failed: {e}")
        raise ValueError(f"Failed to merge PDFs: {e}")


def parse_ranges(ranges: Optional[str], total_pages: int) -> List[Tuple[int,int]]:
    """Parse a page ranges string into a list of (start,end) tuples.

    Example: "1-3,5,7-" -> [(1,3),(5,5),(7,total_pages)]
    """
    if not ranges:
        return [(1, total_pages)]
    
    try:
        res: List[Tuple[int,int]] = []
        for part in ranges.split(','):
            part = part.strip()
            if not part:
                continue
                
            if '-' in part:
                start_str, end_str = part.split('-', 1)
                start = int(start_str) if start_str.strip() else 1
                end = int(end_str) if end_str.strip() else total_pages
                
                if start < 1 or end > total_pages or start > end:
                    raise ValueError(f"Invalid range: {part}")
                    
                res.append((start, end))
            else:
                page = int(part)
                if page < 1 or page > total_pages:
                    raise ValueError(f"Page {page} out of range 1-{total_pages}")
                res.append((page, page))
        
        if not res:
            return [(1, total_pages)]
        return res
    except ValueError as e:
        if "invalid literal" in str(e):
            raise ValueError("Invalid range format. Use format like '1-3,5,7-'")
        raise


def split_pdf_bytes(file_data: bytes, ranges: Optional[str]) -> Dict[str, bytes]:
    """Split a PDF into one or more PDFs according to ranges and return a dict of filename->bytes."""
    validate_pdf_data(file_data)
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        total = len(reader.pages)
        ranges_list = parse_ranges(ranges, total)
        
        out_files: Dict[str, bytes] = {}
        
        for idx, (start, end) in enumerate(ranges_list, 1):
            writer = PdfWriter()
            
            for i in range(start-1, end):
                writer.add_page(reader.pages[i])
            
            out = io.BytesIO()
            writer.write(out)
            
            if len(ranges_list) == 1 and start == 1 and end == total:
                filename = f"all_pages.pdf"
            elif start == end:
                filename = f"page_{start}.pdf"
            else:
                filename = f"pages_{start}-{end}.pdf"
            
            out_files[filename] = out.getvalue()
        
        return out_files
    except Exception as e:
        logger.error(f"PDF split failed: {e}")
        raise ValueError(f"Failed to split PDF: {e}")


def rotate_pdf_bytes(file_data: bytes, degrees: int, selected_pages: Optional[List[int]] = None) -> bytes:
    """Rotate all or selected pages in a PDF and return new PDF bytes."""
    validate_pdf_data(file_data)
    
    if degrees not in [0, 90, 180, 270]:
        raise ValueError("Degrees must be 0, 90, 180, or 270")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        total_pages = len(reader.pages)
        page_numbers = set(selected_pages) if selected_pages else None

        if page_numbers and any(page < 1 or page > total_pages for page in page_numbers):
            raise ValueError(f"Selected pages must be between 1 and {total_pages}")
        
        for page_number, page in enumerate(reader.pages, 1):
            if degrees != 0 and (page_numbers is None or page_number in page_numbers):
                page.rotate(degrees)
            writer.add_page(page)
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"PDF rotation failed: {e}")
        raise ValueError(f"Failed to rotate PDF: {e}")


def extract_text_bytes(file_data: bytes) -> str:
    """Extract text from a PDF. If direct text extraction yields no content, fall back to OCR.

    Returns:
        str: extracted text (joined by newlines per page) or a descriptive message when no text is found.
    """
    validate_pdf_data(file_data)

    try:
        reader = PdfReader(io.BytesIO(file_data))
        texts = []

        # Attempt to extract text from each page first
        has_text = False
        for page in reader.pages:
            text = page.extract_text()
            if text and text.strip():
                texts.append(text.strip())
                has_text = True
            else:
                texts.append("")

        # If no page contained extractable text, perform OCR on blank pages
        if not has_text:
            try:
                with safe_fitz_document(file_data) as doc:
                    for page_idx, page_text in enumerate(texts):
                        if not page_text:
                            try:
                                page = doc.load_page(page_idx)
                                pix = page.get_pixmap(dpi=300)
                                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

                                # Try OCR using English as default; if it fails, try default language settings
                                try:
                                    ocr_text = image_to_string(img, lang='eng')
                                except Exception:
                                    ocr_text = image_to_string(img)

                                if ocr_text and ocr_text.strip():
                                    texts[page_idx] = ocr_text.strip()
                                else:
                                    texts[page_idx] = f"[Page {page_idx + 1}: No text detected]"

                                # Close PIL image to free resources
                                try:
                                    img.close()
                                except Exception:
                                    pass
                            except Exception as ocr_error:
                                logger.warning(f"OCR failed for page {page_idx + 1}: {ocr_error}")
                                texts[page_idx] = f"[Page {page_idx + 1}: Text extraction failed]"
            except Exception as fitz_error:
                logger.warning(f"PyMuPDF processing failed: {fitz_error}")
                for i, text in enumerate(texts):
                    if not text:
                        texts[i] = f"[Page {i + 1}: Text extraction not available]"

        result = "\n".join(filter(None, texts))
        return result if result else "No text found in PDF"

    except Exception as e:
        logger.error(f"Text extraction failed: {e}")
        raise ValueError(f"Failed to extract text: {e}")


def _watermark_font(font_family: str, bold: bool, italic: bool) -> str:
    families = {
        "helvetica": ("Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"),
        "times": ("Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"),
        "courier": ("Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"),
    }
    normal, bold_name, italic_name, bold_italic = families.get(font_family, families["helvetica"])
    if bold and italic:
        return bold_italic
    if bold:
        return bold_name
    if italic:
        return italic_name
    return normal


def _make_watermark_pdf(
    page_width: float,
    page_height: float,
    text: str,
    image_data: Optional[bytes],
    opacity: float,
    position: str,
    mosaic: bool,
    rotation: int,
    font_family: str,
    font_size: int,
    bold: bool,
    italic: bool,
    underline: bool,
    color: str,
) -> bytes:
    """Create a single-page text or image watermark PDF."""
    try:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(page_width, page_height))

        margin_x = page_width * 0.14
        margin_y = page_height * 0.14
        x_positions = {"left": margin_x, "center": page_width / 2, "right": page_width - margin_x}
        y_positions = {"bottom": margin_y, "center": page_height / 2, "top": page_height - margin_y}
        vertical, horizontal = position.split('-', 1) if '-' in position else ("center", "center")
        points = [(x_positions.get(horizontal, page_width / 2), y_positions.get(vertical, page_height / 2))]
        if mosaic:
            points = [
                (page_width * x_fraction, page_height * y_fraction)
                for y_fraction in (0.2, 0.5, 0.8)
                for x_fraction in (0.2, 0.5, 0.8)
            ]

        image_reader = None
        image_width = image_height = 0.0
        if image_data:
            image = Image.open(io.BytesIO(image_data)).convert("RGBA")
            alpha = image.getchannel("A").point(lambda value: int(value * opacity))
            image.putalpha(alpha)
            max_width = page_width * (0.22 if mosaic else 0.38)
            max_height = page_height * (0.15 if mosaic else 0.28)
            scale = min(max_width / image.width, max_height / image.height)
            image_width, image_height = image.width * scale, image.height * scale
            image_reader = ImageReader(image)

        font_name = _watermark_font(font_family, bold, italic)
        red = int(color[1:3], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.35
        green = int(color[3:5], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.35
        blue = int(color[5:7], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.35

        for x, y in points:
            c.saveState()
            c.translate(x, y)
            c.rotate(rotation)
            if image_reader:
                c.drawImage(
                    image_reader,
                    -image_width / 2,
                    -image_height / 2,
                    width=image_width,
                    height=image_height,
                    mask='auto',
                    preserveAspectRatio=True,
                )
            else:
                c.setFillAlpha(opacity)
                c.setFillColorRGB(red, green, blue)
                c.setStrokeColorRGB(red, green, blue)
                c.setFont(font_name, font_size)
                c.drawCentredString(0, -font_size * 0.3, text)
                if underline:
                    text_width = pdfmetrics.stringWidth(text, font_name, font_size)
                    c.setLineWidth(max(1, font_size / 18))
                    c.line(-text_width / 2, -font_size * 0.42, text_width / 2, -font_size * 0.42)
            c.restoreState()

        c.showPage()
        c.save()
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Watermark PDF creation failed: {e}")
        raise ValueError(f"Failed to create watermark: {e}")


def add_watermark_bytes(
    file_data: bytes,
    text: str = "",
    image_data: Optional[bytes] = None,
    opacity: float = 0.3,
    position: str = "center-center",
    mosaic: bool = False,
    rotation: int = 45,
    font_family: str = "helvetica",
    font_size: int = 48,
    bold: bool = False,
    italic: bool = False,
    underline: bool = False,
    color: str = "#666666",
    page_from: int = 1,
    page_to: Optional[int] = None,
    layer: str = "over",
) -> bytes:
    """Add a configurable text or image watermark to selected PDF pages."""
    validate_pdf_data(file_data)

    if not image_data and not text.strip():
        raise ValueError("Watermark text or image is required")
    
    if not 0.0 <= opacity <= 1.0:
        raise ValueError("Opacity must be between 0.0 and 1.0")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        total_pages = len(reader.pages)
        last_page = min(page_to or total_pages, total_pages)
        if page_from < 1 or page_from > last_page:
            raise ValueError(f"Page range must be between 1 and {total_pages}")
        
        for page_number, page in enumerate(reader.pages, 1):
            if page_number < page_from or page_number > last_page:
                writer.add_page(page)
                continue
            w = float(page.mediabox.right)
            h = float(page.mediabox.top)

            overlay_pdf = _make_watermark_pdf(
                w, h, text.strip(), image_data, opacity, position, mosaic, rotation,
                font_family, font_size, bold, italic, underline, color,
            )
            overlay_page = PdfReader(io.BytesIO(overlay_pdf)).pages[0]

            if layer == "below":
                overlay_page.merge_page(page)
                writer.add_page(overlay_page)
            else:
                page.merge_page(overlay_page)
                writer.add_page(page)
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"Watermark addition failed: {e}")
        raise ValueError(f"Failed to add watermark: {e}")


def add_text_watermark_bytes(file_data: bytes, text: str, opacity: float = 0.2) -> bytes:
    """Backward-compatible text watermark helper."""
    return add_watermark_bytes(file_data, text=text, opacity=opacity)


def add_page_numbers_bytes(
    file_data: bytes,
    position: str = "bottom-right",
    margin: str = "recommended",
    first_number: int = 1,
    page_from: int = 1,
    page_to: Optional[int] = None,
    text_format: str = "{n} / {p}",
    font_family: str = "helvetica",
    font_size: int = 12,
    bold: bool = False,
    italic: bool = False,
    underline: bool = False,
    color: str = "#333333",
) -> bytes:
    """Add positioned page numbers with configurable text and styling."""
    validate_pdf_data(file_data)

    margin_points = {
        "compact": 0.35 * inch,
        "recommended": 0.55 * inch,
        "spacious": 0.8 * inch,
    }
    if margin not in margin_points:
        raise ValueError("Margin must be compact, recommended, or spacious")
    valid_positions = {
        "top-left", "top-center", "top-right",
        "center-left", "center-center", "center-right",
        "bottom-left", "bottom-center", "bottom-right",
    }
    if position not in valid_positions:
        raise ValueError("Invalid page number position")
    if first_number < 1:
        raise ValueError("First number must be 1 or greater")
    if font_size < 6 or font_size > 72:
        raise ValueError("Font size must be between 6 and 72")
    if "{n}" not in text_format:
        raise ValueError("Page number text must include {n}")

    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        total = len(reader.pages)
        last_page = min(page_to or total, total)
        if page_from < 1 or page_from > last_page:
            raise ValueError(f"Page range must be between 1 and {total}")

        last_number = first_number + last_page - page_from
        font_name = _watermark_font(font_family, bold, italic)
        red = int(color[1:3], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.2
        green = int(color[3:5], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.2
        blue = int(color[5:7], 16) / 255 if len(color) == 7 and color.startswith('#') else 0.2

        for page_number, page in enumerate(reader.pages, start=1):
            if page_number < page_from or page_number > last_page:
                writer.add_page(page)
                continue

            w = float(page.mediabox.right)
            h = float(page.mediabox.top)

            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=(w, h))
            c.setFillColorRGB(red, green, blue)
            c.setStrokeColorRGB(red, green, blue)
            c.setFont(font_name, font_size)

            number = first_number + page_number - page_from
            page_text = text_format.replace("{n}", str(number)).replace("{p}", str(last_number))
            inset = margin_points[margin]
            vertical, horizontal = position.split("-", 1)
            if horizontal == "left":
                x = inset
            elif horizontal == "center":
                x = w / 2
            else:
                x = w - inset

            if vertical == "top":
                y = h - inset - font_size
            elif vertical == "center":
                y = h / 2 - font_size * 0.35
            else:
                y = inset

            if horizontal == "left":
                c.drawString(x, y, page_text)
            elif horizontal == "center":
                c.drawCentredString(x, y, page_text)
            else:
                c.drawRightString(x, y, page_text)
            if underline:
                text_width = pdfmetrics.stringWidth(page_text, font_name, font_size)
                c.setLineWidth(max(0.6, font_size / 18))
                if horizontal == "left":
                    line_start, line_end = x, x + text_width
                elif horizontal == "center":
                    line_start, line_end = x - text_width / 2, x + text_width / 2
                else:
                    line_start, line_end = x - text_width, x
                c.line(line_start, y - font_size * 0.18, line_end, y - font_size * 0.18)

            c.showPage()
            c.save()

            overlay = PdfReader(io.BytesIO(buf.getvalue())).pages[0]
            page.merge_page(overlay)
            writer.add_page(page)

        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"Page numbering failed: {e}")
        raise ValueError(f"Failed to add page numbers: {e}")


def protect_pdf_bytes(file_data: bytes, password: str) -> bytes:
    """Protect PDF with password encryption."""
    validate_pdf_data(file_data)
    
    if not password or len(password.strip()) < 1:
        raise ValueError("Password cannot be empty")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        
        for page in reader.pages:
            writer.add_page(page)
        
        writer.encrypt(password.strip())
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"PDF protection failed: {e}")
        raise ValueError(f"Failed to protect PDF: {e}")


def unlock_pdf_bytes(file_data: bytes, password: str) -> bytes:
    """Remove password protection from a PDF file."""
    validate_pdf_data(file_data, allow_encrypted=True)
    
    if not password:
        raise ValueError("Password cannot be empty")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        
        if reader.is_encrypted:
            if not reader.decrypt(password):
                raise ValueError("Incorrect password")
        
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except ValueError:
        raise  # Re-raise password errors
    except Exception as e:
        logger.error(f"PDF unlock failed: {e}")
        raise ValueError(f"Failed to unlock PDF: {e}")


def images_to_pdf_bytes(images_data: List[bytes], page_size: str = "A4", orientation: str = "portrait", margin: str = "none") -> bytes:
    """Convert image files to a single PDF document."""
    if not images_data:
        raise ValueError("No image files provided")
    
    try:
        valid_page_sizes = {"auto", "A4", "Letter", "Legal"}
        if page_size not in valid_page_sizes:
            raise ValueError(f"Page size must be one of: {', '.join(sorted(valid_page_sizes))}")
        if orientation not in {"portrait", "landscape"}:
            raise ValueError("Orientation must be portrait or landscape")
        if margin not in {"none", "small", "big"}:
            raise ValueError("Margin must be none, small or big")

        images = []
        for i, data in enumerate(images_data):
            try:
                img = Image.open(io.BytesIO(data))
                # Convert to RGB mode for compatibility
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                if page_size == "auto":
                    images.append(img)
                    continue

                dimensions = {
                    "A4": (827, 1169),
                    "Letter": (850, 1100),
                    "Legal": (850, 1400),
                }
                width, height = dimensions[page_size]
                if orientation == "landscape":
                    width, height = height, width
                inset = {"none": 0, "small": 40, "big": 90}[margin]
                img.thumbnail((width - inset * 2, height - inset * 2), Image.Resampling.LANCZOS)
                page = Image.new("RGB", (width, height), "white")
                page.paste(img, ((width - img.width) // 2, (height - img.height) // 2))
                img.close()
                images.append(page)
            except Exception as e:
                raise ValueError(f"Invalid image file {i+1}: {e}")
        
        if not images:
            raise ValueError("No valid images found")
        
        out_buf = io.BytesIO()
        first_image = images[0]
        other_images = images[1:] if len(images) > 1 else []
        
        first_image.save(
            out_buf, 
            format='PDF', 
            save_all=True, 
            append_images=other_images,
            resolution=100.0
        )
        
        # Close all image objects to free memory
        for img in images:
            try:
                img.close()
            except:
                pass
        
        return out_buf.getvalue()
    except Exception as e:
        logger.error(f"Images to PDF conversion failed: {e}")
        if "Invalid image" in str(e):
            raise ValueError(str(e))
        raise ValueError(f"Failed to convert images to PDF: {e}")


def pdf_to_images_zip_bytes(file_data: bytes, image_format: str = "png", quality: str = "medium") -> bytes:
    """Convert PDF pages to PNG images and return as ZIP file."""
    validate_pdf_data(file_data)
    
    try:
        with safe_fitz_document(file_data) as doc:
            if len(doc) == 0:
                raise ValueError("PDF contains no pages")
            
            zip_buf = io.BytesIO()
            
            normalized_format = "jpg" if image_format in {"jpg", "jpeg"} else "png"
            scale = {"low": 1.0, "medium": 2.0, "high": 3.0}.get(quality, 2.0)

            with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
                for page_num in range(len(doc)):
                    try:
                        page = doc.load_page(page_num)
                        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
                        if normalized_format == "jpg":
                            jpeg_quality = {"low": 60, "medium": 82, "high": 95}.get(quality, 82)
                            img_data = pix.tobytes("jpeg", jpg_quality=jpeg_quality)
                        else:
                            img_data = pix.tobytes("png")
                        z.writestr(f"page_{page_num + 1:03d}.{normalized_format}", img_data)
                    except Exception as e:
                        logger.warning(f"Failed to convert page {page_num + 1}: {e}")
                        continue
            
            return zip_buf.getvalue()
    except Exception as e:
        logger.error(f"PDF to images conversion failed: {e}")
        raise ValueError(f"Failed to convert PDF to images: {e}")


def extract_pdf_images_zip_bytes(file_data: bytes, image_format: str = "png", quality: str = "medium") -> bytes:
    """Extract unique embedded raster images from a PDF and return them as a ZIP."""
    validate_pdf_data(file_data)

    try:
        normalized_format = "jpg" if image_format in {"jpg", "jpeg"} else "png"
        jpeg_quality = {"low": 60, "medium": 82, "high": 95}.get(quality, 82)
        seen_xrefs = set()
        extracted_count = 0
        zip_buf = io.BytesIO()

        with safe_fitz_document(file_data) as doc:
            with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for page_index in range(len(doc)):
                    page = doc.load_page(page_index)
                    for image_info in page.get_images(full=True):
                        xref = image_info[0]
                        if xref <= 0 or xref in seen_xrefs:
                            continue
                        seen_xrefs.add(xref)

                        extracted = doc.extract_image(xref)
                        image_bytes = extracted.get("image")
                        if not image_bytes:
                            continue

                        try:
                            with Image.open(io.BytesIO(image_bytes)) as source:
                                output = io.BytesIO()
                                if normalized_format == "jpg":
                                    if source.mode in {"RGBA", "LA"} or "transparency" in source.info:
                                        rgba = source.convert("RGBA")
                                        converted = Image.new("RGB", rgba.size, "white")
                                        converted.paste(rgba, mask=rgba.getchannel("A"))
                                    else:
                                        converted = source.convert("RGB")
                                    converted.save(output, format="JPEG", quality=jpeg_quality, optimize=True)
                                    converted.close()
                                else:
                                    converted = source.convert("RGB") if source.mode == "CMYK" else source.copy()
                                    converted.save(output, format="PNG", optimize=True)
                                    converted.close()

                            extracted_count += 1
                            archive.writestr(
                                f"image_{extracted_count:03d}_page_{page_index + 1:03d}.{normalized_format}",
                                output.getvalue()
                            )
                        except Exception as image_error:
                            logger.warning(f"Failed to extract image xref {xref}: {image_error}")

        if extracted_count == 0:
            raise ValueError("No embedded raster images were found in this PDF")
        return zip_buf.getvalue()
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Embedded image extraction failed: {e}")
        raise ValueError(f"Failed to extract embedded images: {e}")


def compress_pdf_bytes(file_data: bytes, level: str = 'medium') -> bytes:
    """Compress PDF file using different compression levels."""
    validate_pdf_data(file_data)
    
    valid_levels = ['low', 'medium', 'high']
    if level not in valid_levels:
        raise ValueError(f"Compression level must be one of: {', '.join(valid_levels)}")
    
    try:
        with safe_pikepdf_document(file_data) as pdf:
            out = io.BytesIO()
            
            # Configure settings based on compression level
            if level == 'low':
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.specialized)
            elif level == 'medium':
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.generalized,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate)
            elif level == 'high':
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.all,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate,
                        normalize_content=True,
                        linearize=True)
            
            return out.getvalue()
            
    except Exception as e:
        logger.warning(f"Pikepdf compression failed: {e}, falling back to basic copy")
        
        # Fall back to basic PyPDF2 processing
        try:
            reader = PdfReader(io.BytesIO(file_data))
            writer = PdfWriter()
            
            for page in reader.pages:
                writer.add_page(page)
            
            out = io.BytesIO()
            writer.write(out)
            return out.getvalue()
        except Exception as fallback_error:
            logger.error(f"Fallback compression failed: {fallback_error}")
            raise ValueError(f"Failed to compress PDF: {fallback_error}")


def edit_metadata_bytes(file_data: bytes, title: Optional[str] = None, author: Optional[str] = None) -> bytes:
    """Edit PDF metadata (title and author)."""
    validate_pdf_data(file_data)
    
    if title is None and author is None:
        raise ValueError("At least one of title or author must be provided")
    
    try:
        with safe_pikepdf_document(file_data) as pdf:
            # Get or create document info dictionary
            docinfo = pdf.docinfo if pdf.docinfo else pikepdf.Dictionary()
            
            if title is not None:
                docinfo[pikepdf.Name('/Title')] = title.strip()
            if author is not None:
                docinfo[pikepdf.Name('/Author')] = author.strip()
            
            pdf.docinfo = docinfo
            
            out = io.BytesIO()
            pdf.save(out)
            return out.getvalue()
    except Exception as e:
        logger.error(f"Metadata editing failed: {e}")
        raise ValueError(f"Failed to edit metadata: {e}")


def zip_named_files(name_bytes: Dict[str, bytes]) -> bytes:
    """Package files into a ZIP archive."""
    if not name_bytes:
        raise ValueError("No files to zip")
    
    try:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in name_bytes.items():
                if not data:
                    logger.warning(f"Skipping empty file: {name}")
                    continue
                z.writestr(name, data)
        
        return buf.getvalue()
    except Exception as e:
        logger.error(f"ZIP creation failed: {e}")
        raise ValueError(f"Failed to create ZIP file: {e}")


def edit_pdf_bytes(file_data: bytes, edit_document: dict, assets: Dict[str, bytes]) -> bytes:
    """Apply normalized overlay elements to a PDF."""
    validate_pdf_data(file_data)
    elements = edit_document.get("elements") if isinstance(edit_document, dict) else None
    if not isinstance(elements, list):
        raise ValueError("Invalid PDF edit document")
    if len(elements) > 5000:
        raise ValueError("Too many edit elements")

    try:
        with safe_fitz_document(file_data) as document:
            for element in sorted(elements, key=lambda item: (int(item.get("page", 1)), int(item.get("zIndex", 0)))):
                page_index = int(element.get("page", 1)) - 1
                if page_index < 0 or page_index >= len(document):
                    continue

                page = document.load_page(page_index)
                page_width = float(page.rect.width)
                page_height = float(page.rect.height)
                x = max(0.0, min(1.0, float(element.get("x", 0)))) * page_width
                y = max(0.0, min(1.0, float(element.get("y", 0)))) * page_height
                width = max(0.001, min(1.0, float(element.get("width", 0.1)))) * page_width
                height = max(0.001, min(1.0, float(element.get("height", 0.1)))) * page_height
                rect = fitz.Rect(x, y, min(page_width, x + width), min(page_height, y + height))
                opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
                element_type = element.get("type")

                if element_type == "text":
                    text = str(element.get("text", ""))
                    if not text:
                        continue
                    family = element.get("fontFamily", "helvetica")
                    bold = bool(element.get("bold", False))
                    italic = bool(element.get("italic", False))
                    font_map = {
                        ("helvetica", False, False): "helv",
                        ("helvetica", True, False): "hebo",
                        ("helvetica", False, True): "heit",
                        ("helvetica", True, True): "hebi",
                        ("times", False, False): "tiro",
                        ("times", True, False): "tibo",
                        ("times", False, True): "tiit",
                        ("times", True, True): "tibi",
                        ("courier", False, False): "cour",
                        ("courier", True, False): "cobo",
                        ("courier", False, True): "coit",
                        ("courier", True, True): "cobi",
                    }
                    font_name = "china-s" if any(ord(character) > 255 for character in text) else font_map.get((family, bold, italic), "helv")
                    alignment = {"left": 0, "center": 1, "right": 2}.get(element.get("align"), 0)
                    page.insert_textbox(
                        rect,
                        text,
                        fontsize=max(6.0, min(144.0, float(element.get("fontSize", 18)))),
                        fontname=font_name,
                        color=_editor_color(element.get("color", "#333333")),
                        align=alignment,
                        lineheight=1.2,
                        fill_opacity=opacity,
                        overlay=True,
                    )
                    if element.get("underline"):
                        underline_y = min(rect.y1, rect.y0 + float(element.get("fontSize", 18)) * 1.15)
                        page.draw_line(
                            fitz.Point(rect.x0, underline_y),
                            fitz.Point(rect.x1, underline_y),
                            color=_editor_color(element.get("color", "#333333")),
                            width=max(0.6, float(element.get("fontSize", 18)) / 18),
                            stroke_opacity=opacity,
                            overlay=True,
                        )
                elif element_type == "image":
                    asset = assets.get(str(element.get("assetId", "")))
                    if asset:
                        page.insert_image(rect, stream=asset, keep_proportion=True, overlay=True)
                elif element_type == "shape":
                    stroke = _editor_color(element.get("stroke", "#347759"))
                    fill_value = element.get("fill", "transparent")
                    fill = None if fill_value in {"", "transparent", "none"} else _editor_color(fill_value, "#edf6f0")
                    line_width = max(0.5, min(30.0, float(element.get("strokeWidth", 2))))
                    shape = element.get("shape", "rectangle")
                    if shape == "rectangle":
                        page.draw_rect(rect, color=stroke, fill=fill, width=line_width, stroke_opacity=opacity, fill_opacity=opacity, overlay=True)
                    elif shape == "ellipse":
                        page.draw_oval(rect, color=stroke, fill=fill, width=line_width, stroke_opacity=opacity, fill_opacity=opacity, overlay=True)
                    else:
                        start = fitz.Point(rect.x0, rect.y0)
                        end = fitz.Point(rect.x1, rect.y1)
                        page.draw_line(start, end, color=stroke, width=line_width, stroke_opacity=opacity, overlay=True)
                        if shape == "arrow":
                            angle = math.atan2(end.y - start.y, end.x - start.x)
                            arrow_size = max(7.0, line_width * 4.0)
                            left = fitz.Point(end.x - arrow_size * math.cos(angle - 0.55), end.y - arrow_size * math.sin(angle - 0.55))
                            right = fitz.Point(end.x - arrow_size * math.cos(angle + 0.55), end.y - arrow_size * math.sin(angle + 0.55))
                            page.draw_polyline([left, end, right], color=stroke, width=line_width, stroke_opacity=opacity, overlay=True)
                elif element_type == "drawing":
                    raw_points = element.get("points", [])
                    points = [
                        fitz.Point(float(raw_points[index]) * page_width, float(raw_points[index + 1]) * page_height)
                        for index in range(0, len(raw_points) - 1, 2)
                    ]
                    if len(points) >= 2:
                        page.draw_polyline(
                            points,
                            color=_editor_color(element.get("stroke", "#347759")),
                            width=max(0.5, min(30.0, float(element.get("strokeWidth", 3)))),
                            stroke_opacity=opacity,
                            overlay=True,
                        )

            return document.tobytes(garbage=4, deflate=True)
    except Exception as error:
        logger.error(f"PDF editing failed: {error}")
        raise ValueError(f"Failed to edit PDF: {error}")


def get_pdf_metadata_bytes(file_data: bytes) -> dict:
    """Extract comprehensive metadata from PDF file."""
    validate_pdf_data(file_data)
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        metadata = reader.metadata or {}
        
        # Basic document information
        result = {
            "pages": len(reader.pages),
            "title": metadata.get("/Title"),
            "author": metadata.get("/Author"),
            "subject": metadata.get("/Subject"),
            "creator": metadata.get("/Creator"),
            "producer": metadata.get("/Producer"),
            "creation_date": str(metadata.get("/CreationDate")) if metadata.get("/CreationDate") else None,
            "modification_date": str(metadata.get("/ModDate")) if metadata.get("/ModDate") else None,
            "is_encrypted": reader.is_encrypted
        }
        
        # Clean up None values and convert to strings
        cleaned_result = {}
        for key, value in result.items():
            if value is not None:
                cleaned_result[key] = str(value) if not isinstance(value, (int, bool)) else value
            else:
                cleaned_result[key] = value
        
        return cleaned_result
        
    except Exception as e:
        logger.error(f"Metadata extraction failed: {e}")
        raise ValueError(f"Failed to extract metadata: {e}")


def reorder_pdf_bytes(file_data: bytes, order_csv: str) -> bytes:
    """Reorder PDF pages according to the specified page order."""
    validate_pdf_data(file_data)
    
    if not order_csv or not order_csv.strip():
        raise ValueError("Page order cannot be empty")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        total = len(reader.pages)
        
        # Parse page order
        try:
            order_list = []
            for part in order_csv.split(','):
                part = part.strip()
                if part:
                    page_num = int(part)
                    if page_num < 1 or page_num > total:
                        raise ValueError(f"Page number {page_num} out of range (1-{total})")
                    order_list.append(page_num)
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError("Invalid page order format. Use comma-separated numbers like '3,1,2'")
            raise
        
        if not order_list:
            raise ValueError("No valid page numbers found in order")
        
        # Create reordered PDF
        writer = PdfWriter()
        for page_num in order_list:
            writer.add_page(reader.pages[page_num - 1])  # Convert to 0-based index
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"PDF reordering failed: {e}")
        if "Page number" in str(e) or "Invalid page order" in str(e):
            raise ValueError(str(e))
        raise ValueError(f"Failed to reorder PDF pages: {e}")
