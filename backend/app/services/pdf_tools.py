from typing import List, Optional, Dict, Tuple
import io
import zipfile
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
import pikepdf
import fitz  # PyMuPDF

# Helper to ensure fonts
try:
    pdfmetrics.registerFont(TTFont('Helvetica', 'Helvetica.ttf'))
except Exception:
    pass


def merge_pdfs_bytes(files_data: List[bytes]) -> bytes:
    writer = PdfWriter()
    for data in files_data:
        reader = PdfReader(io.BytesIO(data))
        for page in reader.pages:
            writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def parse_ranges(ranges: Optional[str], total_pages: int) -> List[Tuple[int,int]]:
    # ranges like "1-3,5,7-"
    if not ranges:
        return [(1, total_pages)]
    res: List[Tuple[int,int]] = []
    for part in ranges.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-', 1)
            s = int(start) if start else 1
            e = int(end) if end else total_pages
            res.append((s, e))
        else:
            p = int(part)
            res.append((p, p))
    return res


def split_pdf_bytes(file_data: bytes, ranges: Optional[str]) -> Dict[str, bytes]:
    reader = PdfReader(io.BytesIO(file_data))
    total = len(reader.pages)
    ranges_list = parse_ranges(ranges, total)
    out_files: Dict[str, bytes] = {}
    idx = 1
    for s, e in ranges_list:
        writer = PdfWriter()
        s0 = max(1, s)
        e0 = min(total, e)
        for i in range(s0-1, e0):
            writer.add_page(reader.pages[i])
        out = io.BytesIO()
        writer.write(out)
        out_files[f"part_{idx}.pdf"] = out.getvalue()
        idx += 1
    return out_files


def rotate_pdf_bytes(file_data: bytes, degrees: int) -> bytes:
    reader = PdfReader(io.BytesIO(file_data))
    writer = PdfWriter()
    for page in reader.pages:
        page.rotate(degrees)
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def extract_text_bytes(file_data: bytes) -> str:
    reader = PdfReader(io.BytesIO(file_data))
    texts = []
    for page in reader.pages:
        t = page.extract_text() or ""
        texts.append(t)
    return "\n".join(texts)


def _make_text_pdf(page_width, page_height, text: str, opacity: float = 0.2) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))
    c.saveState()
    # simulate opacity via light gray (approximation)
    c.setFillGray(max(0.0, min(1.0, 1.0 - opacity)))
    c.setFont("Helvetica", 48)
    c.translate(page_width/2, page_height/2)
    c.rotate(45)
    c.drawCentredString(0, 0, text)
    c.restoreState()
    c.showPage()
    c.save()
    return buf.getvalue()


def add_text_watermark_bytes(file_data: bytes, text: str, opacity: float = 0.2) -> bytes:
    # Render a watermark PDF per page and merge using PyPDF2
    reader = PdfReader(io.BytesIO(file_data))
    writer = PdfWriter()
    for base_page in reader.pages:
        w = float(base_page.mediabox.right)
        h = float(base_page.mediabox.top)
        overlay_pdf = _make_text_pdf(w, h, text, opacity)
        overlay_page = PdfReader(io.BytesIO(overlay_pdf)).pages[0]
        base_page.merge_page(overlay_page)
        writer.add_page(base_page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def add_page_numbers_bytes(file_data: bytes, position: str = "bottom-right") -> bytes:
    reader = PdfReader(io.BytesIO(file_data))
    writer = PdfWriter()
    total = len(reader.pages)
    for i, page in enumerate(reader.pages, start=1):
        w = float(page.mediabox.right)
        h = float(page.mediabox.top)
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=(w, h))
        c.setFont("Helvetica", 12)
        x, y = w - 0.7*inch, 0.5*inch
        if position == "bottom-left":
            x, y = 0.7*inch, 0.5*inch
        elif position == "top-right":
            x, y = w - 0.7*inch, h - 0.5*inch
        elif position == "top-left":
            x, y = 0.7*inch, h - 0.5*inch
        c.drawString(x, y, f"{i}/{total}")
        c.showPage()
        c.save()
        overlay = PdfReader(io.BytesIO(buf.getvalue())).pages[0]
        page.merge_page(overlay)
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def protect_pdf_bytes(file_data: bytes, password: str) -> bytes:
    reader = PdfReader(io.BytesIO(file_data))
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def unlock_pdf_bytes(file_data: bytes, password: str) -> bytes:
    reader = PdfReader(io.BytesIO(file_data))
    if reader.is_encrypted:
        if not reader.decrypt(password):
            raise ValueError("Wrong password or unable to decrypt")
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def images_to_pdf_bytes(images_data: List[bytes]) -> bytes:
    images = []
    for data in images_data:
        im = Image.open(io.BytesIO(data)).convert('RGB')
        images.append(im)
    out_buf = io.BytesIO()
    if not images:
        return b""
    first, rest = images[0], images[1:]
    first.save(out_buf, format='PDF', save_all=True, append_images=rest)
    return out_buf.getvalue()


def pdf_to_images_zip_bytes(file_data: bytes) -> bytes:
    """
    Convert PDF to images and return as ZIP using PyMuPDF
    """
    doc = fitz.open(stream=file_data, filetype="pdf")
    zip_buf = io.BytesIO()
    
    with zipfile.ZipFile(zip_buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            img_data = pix.tobytes("png")
            z.writestr(f"page_{page_num + 1}.png", img_data)
    
    doc.close()
    return zip_buf.getvalue()


def compress_pdf_bytes(file_data: bytes, level: str = 'medium') -> bytes:
    """
    Compress PDF using pikepdf with different compression strategies
    """
    try:
        with pikepdf.open(io.BytesIO(file_data)) as pdf:
            out = io.BytesIO()
            
            # Configure compression settings based on level
            if level == 'low':
                # Light compression - preserve quality
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.specialized)
            elif level == 'medium':
                # Balanced compression
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.generalized,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate)
            elif level == 'high':
                # Maximum compression
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.all,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate,
                        normalize_content=True,
                        linearize=True)
            else:
                # Default to medium
                pdf.save(out, 
                        compress_streams=True,
                        stream_decode_level=pikepdf.StreamDecodeLevel.generalized)
            
            return out.getvalue()
            
    except Exception as e:
        # Fallback: if pikepdf fails, try basic PyPDF2 approach
        print(f"Pikepdf compression failed: {e}, falling back to basic copy")
        reader = PdfReader(io.BytesIO(file_data))
        writer = PdfWriter()
        
        # Copy all pages
        for page in reader.pages:
            writer.add_page(page)
        
        # PyPDF2 doesn't have direct compression methods, just copy the file
        out = io.BytesIO()
        writer.write(out)
        return out.getvalue()


def edit_metadata_bytes(file_data: bytes, title: Optional[str] = None, author: Optional[str] = None) -> bytes:
    with pikepdf.open(io.BytesIO(file_data)) as pdf:
        docinfo = pdf.docinfo or pikepdf.Dictionary()
        if title is not None:
            docinfo[pikepdf.Name('/Title')] = title
        if author is not None:
            docinfo[pikepdf.Name('/Author')] = author
        pdf.docinfo = docinfo
        out = io.BytesIO()
        pdf.save(out)
        return out.getvalue()


def zip_named_files(name_bytes: Dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in name_bytes.items():
            z.writestr(name, data)
    return buf.getvalue()


def reorder_pdf_bytes(file_data: bytes, order_csv: str) -> bytes:
    """
    Reorder pages by 1-based indices provided as CSV, e.g., "3,1,2".
    Duplicates allowed. Indices outside range raise ValueError.
    """
    reader = PdfReader(io.BytesIO(file_data))
    total = len(reader.pages)
    try:
        order = [int(x.strip()) for x in order_csv.split(',') if x.strip()]
    except Exception:
        raise ValueError("Invalid order format; use comma-separated integers like 3,1,2")
    if not order:
        raise ValueError("Order list is empty")
    writer = PdfWriter()
    for idx in order:
        if idx < 1 or idx > total:
            raise ValueError(f"Page index {idx} out of range 1..{total}")
        writer.add_page(reader.pages[idx-1])
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
