from typing import List, Optional, Dict, Tuple
import io
import zipfile
import logging
from contextlib import contextmanager
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import pikepdf
import fitz  # PyMuPDF
from pytesseract import image_to_string

# Configure logger
logger = logging.getLogger(__name__)

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


def validate_pdf_data(file_data: bytes) -> None:
    """Validate that the provided bytes represent a non-empty PDF file.

    Raises ValueError on invalid or empty data.
    """
    if not file_data:
        raise ValueError("Empty PDF data")
    
    try:
        # Try to read with PyPDF2 to validate PDF format
        reader = PdfReader(io.BytesIO(file_data))
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


def rotate_pdf_bytes(file_data: bytes, degrees: int) -> bytes:
    """Rotate all pages in a PDF by degrees (90,180,270) and return new PDF bytes."""
    validate_pdf_data(file_data)
    
    if degrees not in [90, 180, 270]:
        raise ValueError("Degrees must be 90, 180, or 270")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        
        for page in reader.pages:
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


def _make_text_pdf(page_width: float, page_height: float, text: str, opacity: float = 0.2) -> bytes:
    """Create a PDF with watermark text for overlay purposes."""
    try:
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(page_width, page_height))
        c.saveState()
        
        # Set opacity and color
        gray_value = max(0.0, min(1.0, 1.0 - opacity))
        c.setFillGray(gray_value)
        c.setFont("Helvetica", 48)
        
        # Position and rotation for watermark
        c.translate(page_width/2, page_height/2)
        c.rotate(45)
        c.drawCentredString(0, 0, text)
        
        c.restoreState()
        c.showPage()
        c.save()
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Watermark PDF creation failed: {e}")
        raise ValueError(f"Failed to create watermark: {e}")


def add_text_watermark_bytes(file_data: bytes, text: str, opacity: float = 0.2) -> bytes:
    """Add text watermark to all pages of a PDF."""
    validate_pdf_data(file_data)
    
    if not text or not text.strip():
        raise ValueError("Watermark text cannot be empty")
    
    if not 0.0 <= opacity <= 1.0:
        raise ValueError("Opacity must be between 0.0 and 1.0")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        
        for page in reader.pages:
            w = float(page.mediabox.right)
            h = float(page.mediabox.top)
            
            overlay_pdf = _make_text_pdf(w, h, text.strip(), opacity)
            overlay_page = PdfReader(io.BytesIO(overlay_pdf)).pages[0]
            
            page.merge_page(overlay_page)
            writer.add_page(page)
        
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception as e:
        logger.error(f"Watermark addition failed: {e}")
        raise ValueError(f"Failed to add watermark: {e}")


def add_page_numbers_bytes(file_data: bytes, position: str = "bottom-right") -> bytes:
    """Add page numbers to all pages of a PDF."""
    validate_pdf_data(file_data)
    
    valid_positions = ["bottom-right", "bottom-left", "top-right", "top-left", "bottom-center", "top-center"]
    if position not in valid_positions:
        raise ValueError(f"Position must be one of: {', '.join(valid_positions)}")
    
    try:
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        total = len(reader.pages)
        
        for i, page in enumerate(reader.pages, start=1):
            w = float(page.mediabox.right)
            h = float(page.mediabox.top)
            
            buf = io.BytesIO()
            c = canvas.Canvas(buf, pagesize=(w, h))
            c.setFont("Helvetica", 12)
            
            # Calculate page number position
            margin = 0.7 * inch
            if position == "bottom-right":
                x, y = w - margin, margin
            elif position == "bottom-left":
                x, y = margin, margin
            elif position == "top-right":
                x, y = w - margin, h - margin
            elif position == "top-left":
                x, y = margin, h - margin
            elif position == "bottom-center":
                x, y = w / 2, margin
            elif position == "top-center":
                x, y = w / 2, h - margin
            
            page_text = f"{i}/{total}"
            if "center" in position:
                c.drawCentredString(x, y, page_text)
            else:
                c.drawString(x, y, page_text)
            
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
    validate_pdf_data(file_data)
    
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


def images_to_pdf_bytes(images_data: List[bytes]) -> bytes:
    """Convert image files to a single PDF document."""
    if not images_data:
        raise ValueError("No image files provided")
    
    try:
        images = []
        for i, data in enumerate(images_data):
            try:
                img = Image.open(io.BytesIO(data))
                # Convert to RGB mode for compatibility
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                images.append(img)
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


def pdf_to_images_zip_bytes(file_data: bytes) -> bytes:
    """Convert PDF pages to PNG images and return as ZIP file."""
    validate_pdf_data(file_data)
    
    try:
        with safe_fitz_document(file_data) as doc:
            if len(doc) == 0:
                raise ValueError("PDF contains no pages")
            
            zip_buf = io.BytesIO()
            
            with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
                for page_num in range(len(doc)):
                    try:
                        page = doc.load_page(page_num)
                        # Use 2x scaling for higher image quality
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                        img_data = pix.tobytes("png")
                        z.writestr(f"page_{page_num + 1:03d}.png", img_data)
                    except Exception as e:
                        logger.warning(f"Failed to convert page {page_num + 1}: {e}")
                        continue
            
            return zip_buf.getvalue()
    except Exception as e:
        logger.error(f"PDF to images conversion failed: {e}")
        raise ValueError(f"Failed to convert PDF to images: {e}")


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
