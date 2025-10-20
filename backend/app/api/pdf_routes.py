from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Optional
import io
import logging
import asyncio
from datetime import datetime

from ..services import pdf_tools

# Configure router logger
logger = logging.getLogger(__name__)
router = APIRouter()

# File size limit (50MB)
MAX_FILE_SIZE = 50 * 1024 * 1024

async def validate_upload_file(file: UploadFile, file_type: str = "PDF") -> bytes:
    """Validate and read uploaded file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Check file type
    if file_type == "PDF" and not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Read file data
    try:
        data = await file.read()
    except Exception as e:
        logger.error(f"Failed to read file {file.filename}: {e}")
        raise HTTPException(status_code=400, detail="Failed to read file")
    
    # Check file size
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB")
    
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    
    return data

async def validate_multiple_files(files: List[UploadFile], file_type: str = "PDF") -> List[bytes]:
    """Validate and read multiple uploaded files."""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    
    if len(files) > 20:  # Limit to maximum 20 files
        raise HTTPException(status_code=400, detail="Too many files. Maximum is 20 files")
    
    files_data = []
    for i, file in enumerate(files):
        try:
            data = await validate_upload_file(file, file_type)
            files_data.append(data)
        except HTTPException as e:
            # Re-raise with file index information
            raise HTTPException(status_code=e.status_code, detail=f"File {i+1}: {e.detail}")
    
    return files_data

def create_error_response(error: Exception, operation: str) -> HTTPException:
    """Create standardized error response."""
    logger.error(f"{operation} failed: {error}")
    
    if isinstance(error, ValueError):
        return HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, FileNotFoundError):
        return HTTPException(status_code=404, detail="File not found")
    elif isinstance(error, PermissionError):
        return HTTPException(status_code=403, detail="Permission denied")
    else:
        return HTTPException(status_code=500, detail=f"Internal server error: {operation} failed")

@router.post("/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    """Merge multiple PDF files into one."""
    try:
        files_data = await validate_multiple_files(files, "PDF")
        logger.info(f"Merging {len(files_data)} PDF files")
        
        result = pdf_tools.merge_pdfs_bytes(files_data)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=merged.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF merge")

@router.post("/reorder")
async def reorder_pdf(file: UploadFile = File(...), order: str = Form(...)):
    """Reorder PDF pages according to specified order."""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Reordering PDF pages with order: {order}")
        
        result = pdf_tools.reorder_pdf_bytes(data, order)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=reordered.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF reorder")

@router.post("/split")
async def split_pdf(file: UploadFile = File(...), ranges: Optional[str] = Form(None)):
    """Split PDF file into separate files by page ranges."""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Splitting PDF with ranges: {ranges or 'all pages'}")
        
        parts = pdf_tools.split_pdf_bytes(data, ranges)
        
        if len(parts) == 1:
            # If only one file, return PDF directly
            filename, file_data = next(iter(parts.items()))
            return StreamingResponse(
                io.BytesIO(file_data), 
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"}
            )
        else:
            # Multiple files, return as ZIP
            zip_bytes = pdf_tools.zip_named_files(parts)
            return StreamingResponse(
                io.BytesIO(zip_bytes), 
                media_type="application/zip",
                headers={"Content-Disposition": "attachment; filename=split_pages.zip"}
            )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF split")

@router.post("/rotate")
async def rotate_pdf(file: UploadFile = File(...), angle: int = Form(90)):
    """Rotate PDF pages by specified angle"""
    try:
        data = await validate_upload_file(file, "PDF")
        # Validate angle
        if angle not in [90, 180, 270]:
            return create_error_response("Angle must be 90, 180 or 270", 400)
            
        logger.info(f"Rotating PDF by {angle} degrees")
        
        result = pdf_tools.rotate_pdf_bytes(data, angle)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=rotated.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF rotation")

@router.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extract text from PDF"""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info("Extracting text from PDF")
        
        # Run text extraction in background thread (may involve OCR, time-consuming)
        text = await asyncio.get_event_loop().run_in_executor(
            None, pdf_tools.extract_text_bytes, data
        )
        
        return JSONResponse({
            "text": text,
            "timestamp": datetime.now().isoformat(),
            "filename": file.filename
        })
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "Text extraction")

@router.post("/watermark")
async def add_watermark(file: UploadFile = File(...), watermark_text: str = Form("WATERMARK"), position: str = Form("center"), opacity: float = Form(0.3)):
    """Add watermark to PDF"""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Adding watermark: '{watermark_text}' with opacity {opacity}")
        
        result = pdf_tools.add_text_watermark_bytes(data, watermark_text, opacity)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=watermarked.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "Watermark addition")

@router.post("/pagenum")
async def add_page_numbers(file: UploadFile = File(...), position: str = Form("bottom-right")):
    """Add page numbers to PDF"""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Adding page numbers at position: {position}")
        
        result = pdf_tools.add_page_numbers_bytes(data, position)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=numbered.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "Page numbering")

@router.post("/protect")
async def protect_pdf(file: UploadFile = File(...), password: str = Form(...)):
    """Add password protection to PDF"""
    try:
        data = await validate_upload_file(file, "PDF")
        
        if not password:
            return create_error_response("Password cannot be empty", 400)
            
        logger.info("Protecting PDF with password")
        
        result = pdf_tools.protect_pdf_bytes(data, password)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=protected.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF protection")

@router.post("/unlock")
async def unlock_pdf(file: UploadFile = File(...), password: str = Form(...)):
    """Remove password protection from PDF"""
    try:
        data = await validate_upload_file(file, "PDF")
        
        if not password:
            return create_error_response("Password cannot be empty", 400)
            
        logger.info("Unlocking PDF")
        
        result = pdf_tools.unlock_pdf_bytes(data, password)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=unlocked.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF unlock")

@router.post("/images-to-pdf")
async def images_to_pdf_endpoint(files: List[UploadFile] = File(...), page_size: str = Form("auto")):
    """Convert multiple images to PDF"""
    try:
        # Validate image files
        files_data = []
        for i, file in enumerate(files):
            if not file.filename:
                raise HTTPException(status_code=400, detail=f"File {i+1}: No filename")
            
            # Check if it's an image file
            valid_extensions = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.gif']
            if not any(file.filename.lower().endswith(ext) for ext in valid_extensions):
                raise HTTPException(status_code=400, detail=f"File {i+1}: Must be an image file")
            
            data = await file.read()
            if len(data) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail=f"File {i+1}: Too large")
            if len(data) == 0:
                raise HTTPException(status_code=400, detail=f"File {i+1}: Empty file")
            
            files_data.append(data)
        
        logger.info(f"Converting {len(files_data)} images to PDF (page size: {page_size})")
        
        result = pdf_tools.images_to_pdf_bytes(files_data, page_size)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=converted.pdf"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "Images to PDF conversion")

@router.post("/pdf-to-images")
async def pdf_to_images(file: UploadFile = File(...), format: str = Form("png"), quality: str = Form("medium")):
    """Convert PDF to images"""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Converting PDF to images (format: {format}, quality: {quality})")
        
        # Run conversion in background thread (may take time)
        zip_bytes = await asyncio.get_event_loop().run_in_executor(
            None, pdf_tools.pdf_to_images_zip_bytes, data, format, quality
        )
        
        return StreamingResponse(
            io.BytesIO(zip_bytes), 
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=pdf_images.zip"}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF to images conversion")

@router.post("/compress")
async def compress_pdf(file: UploadFile = File(...), level: str = Form("medium")):
    """Compress PDF file"""
    try:
        data = await validate_upload_file(file, "PDF")
        logger.info(f"Compressing PDF with level: {level}")
        
        result = pdf_tools.compress_pdf_bytes(data, level)
        
        # Calculate compression ratio
        original_size = len(data)
        compressed_size = len(result)
        compression_ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0
        
        logger.info(f"Compression completed: {original_size} -> {compressed_size} bytes ({compression_ratio:.1f}% reduction)")
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=compressed.pdf",
                "X-Original-Size": str(original_size),
                "X-Compressed-Size": str(compressed_size),
                "X-Compression-Ratio": f"{compression_ratio:.1f}%"
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        raise create_error_response(e, "PDF compression")

@router.post("/metadata")
async def get_pdf_metadata(file: UploadFile = File(...)):
    """Get PDF metadata"""

# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check endpoint"""
