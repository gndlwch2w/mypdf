from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Optional
import io
import logging
import asyncio
from datetime import datetime

from ..services import pdf_tools
from ..config.settings import settings
from ..models.responses import (
    PDFMetadataResponse, 
    TextExtractionResponse, 
    CompressionResponse,
    HealthResponse
)
from ..utils.validators import FileValidator, ParameterValidator
from ..exceptions.custom_exceptions import (
    InvalidFileError,
    FileSizeError, 
    ValidationError,
    ProcessingError,
    PasswordError
)

# Configure router logger
logger = logging.getLogger(__name__)
router = APIRouter()

# Dependency injection functions for validation
async def validate_single_pdf(file: UploadFile = File(...)) -> bytes:
    """Dependency to validate single PDF file."""
    return await FileValidator.validate_pdf_file(file)

async def validate_multiple_pdfs(files: List[UploadFile] = File(...)) -> List[bytes]:
    """Dependency to validate multiple PDF files."""
    return await FileValidator.validate_multiple_files(files, "PDF")

async def validate_multiple_images(files: List[UploadFile] = File(...)) -> List[bytes]:
    """Dependency to validate multiple image files."""
    return await FileValidator.validate_multiple_files(files, "image")

def create_error_response(error: Exception, operation: str) -> HTTPException:
    """Create standardized error response from exceptions."""
    logger.error(f"{operation} failed: {error}")
    
    if isinstance(error, (InvalidFileError, ValidationError)):
        raise HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, FileSizeError):
        raise HTTPException(status_code=413, detail=str(error))
    elif isinstance(error, PasswordError):
        raise HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, ProcessingError):
        raise HTTPException(status_code=500, detail=str(error))
    else:
        raise HTTPException(status_code=500, detail=f"Internal server error: {operation} failed")


# Dependency functions for validation
async def validate_single_pdf(file: UploadFile = File(...)) -> bytes:
    """Dependency to validate a single PDF file."""
    return await FileValidator.validate_pdf_file(file)


async def validate_multiple_pdfs(files: List[UploadFile] = File(...)) -> List[bytes]:
    """Dependency to validate multiple PDF files."""
    return await FileValidator.validate_multiple_files(files, "PDF")


async def validate_multiple_images(files: List[UploadFile] = File(...)) -> List[bytes]:
    """Dependency to validate multiple image files."""
    return await FileValidator.validate_multiple_files(files, "image")


def create_error_response(error: Exception, operation: str) -> HTTPException:
    """Create standardized error response with proper exception mapping."""
    logger.error(f"{operation} failed: {error}")
    
    if isinstance(error, (InvalidFileError, ValidationError)):
        return HTTPException(status_code=400, detail=str(error))
    elif isinstance(error, FileSizeError):
        return HTTPException(status_code=413, detail=str(error))
    elif isinstance(error, PasswordError):
        return HTTPException(status_code=401, detail=str(error))
    elif isinstance(error, ProcessingError):
        return HTTPException(status_code=422, detail=str(error))
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
        files_data = await FileValidator.validate_multiple_files(files, "PDF")
        logger.info(f"Merging {len(files_data)} PDF files")
        
        result = pdf_tools.merge_pdfs_bytes(files_data)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=merged.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF merge")

@router.post("/reorder")
async def reorder_pdf(
    file: UploadFile = File(...), 
    order: str = Form(...)
):
    """Reorder PDF pages according to specified order."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        logger.info(f"Reordering PDF pages with order: {order}")
        
        result = pdf_tools.reorder_pdf_bytes(file_data, order)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=reordered.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF reorder")

@router.post("/split")
async def split_pdf(
    file: UploadFile = File(...), 
    ranges: Optional[str] = Form(None)
):
    """Split PDF file into separate files by page ranges."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        logger.info(f"Splitting PDF with ranges: {ranges or 'all pages'}")
        
        parts = pdf_tools.split_pdf_bytes(file_data, ranges)
        
        if len(parts) == 1:
            # If only one file, return PDF directly
            filename, file_content = next(iter(parts.items()))
            return StreamingResponse(
                io.BytesIO(file_content), 
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
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF split")

@router.post("/rotate")
async def rotate_pdf(
    file: UploadFile = File(...), 
    angle: int = Form(90)
):
    """Rotate PDF pages by specified angle (90, 180, or 270 degrees)."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate angle
        angle = ParameterValidator.validate_rotation_angle(angle)
        logger.info(f"Rotating PDF by {angle} degrees")
        
        result = pdf_tools.rotate_pdf_bytes(file_data, angle)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=rotated.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF rotation")

@router.post("/extract-text", response_model=TextExtractionResponse)
async def extract_text(file: UploadFile = File(...)):
    """Extract text from PDF with OCR fallback."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        logger.info("Extracting text from PDF")
        
        # Run text extraction in background thread (may involve OCR, time-consuming)
        text = await asyncio.get_event_loop().run_in_executor(
            None, pdf_tools.extract_text_bytes, file_data
        )
        
        # Determine extraction method based on content
        extraction_method = "direct" if text and not "[Page" in text else "ocr"
        if "[Page" in text and text.count("[Page") < text.count("\n"):
            extraction_method = "mixed"
        
        return TextExtractionResponse(
            text=text,
            filename=file.filename or "unknown.pdf",
            pages_processed=len([line for line in text.split("\n") if line.strip()]) if text else 0,
            extraction_method=extraction_method
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Text extraction")

@router.post("/watermark")
async def add_watermark(
    file: UploadFile = File(...),
    watermark_text: str = Form("WATERMARK"),
    opacity: float = Form(0.3)
):
    """Add text watermark to PDF."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate parameters
        if not watermark_text.strip():
            raise ValidationError("Watermark text cannot be empty")
        opacity = ParameterValidator.validate_opacity(opacity)
        
        logger.info(f"Adding watermark: '{watermark_text}' with opacity {opacity}")
        
        result = pdf_tools.add_text_watermark_bytes(file_data, watermark_text.strip(), opacity)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=watermarked.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Watermark addition")

@router.post("/pagenum")
async def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-right")
):
    """Add page numbers to PDF."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate position
        valid_positions = ["bottom-right", "bottom-left", "top-right", "top-left", "bottom-center", "top-center"]
        position = ParameterValidator.validate_position(position, valid_positions)
        
        logger.info(f"Adding page numbers at position: {position}")
        
        result = pdf_tools.add_page_numbers_bytes(file_data, position)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=numbered.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Page numbering")

@router.post("/protect")
async def protect_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    """Add password protection to PDF."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate password
        password = ParameterValidator.validate_password(password)
        logger.info("Protecting PDF with password")
        
        result = pdf_tools.protect_pdf_bytes(file_data, password)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=protected.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF protection")

@router.post("/unlock")
async def unlock_pdf(
    file: UploadFile = File(...),
    password: str = Form(...)
):
    """Remove password protection from PDF."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate password
        password = ParameterValidator.validate_password(password)
        logger.info("Unlocking PDF")
        
        result = pdf_tools.unlock_pdf_bytes(file_data, password)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=unlocked.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF unlock")

@router.post("/images-to-pdf")
async def images_to_pdf_endpoint(
    files: List[UploadFile] = File(...),
    page_size: str = Form("auto")
):
    """Convert multiple images to PDF."""
    try:
        files_data = await FileValidator.validate_multiple_files(files, "image")
        logger.info(f"Converting {len(files_data)} images to PDF (page size: {page_size})")
        
        result = pdf_tools.images_to_pdf_bytes(files_data)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=converted.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Images to PDF conversion")

@router.post("/pdf-to-images")
async def pdf_to_images(
    file: UploadFile = File(...),
    format: str = Form("png"),
    quality: str = Form("medium")
):
    """Convert PDF to images."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate format and quality
        valid_formats = ["png", "jpg", "jpeg"]
        valid_qualities = ["low", "medium", "high"]
        
        if format not in valid_formats:
            raise ValidationError(f"Format must be one of: {', '.join(valid_formats)}")
        if quality not in valid_qualities:
            raise ValidationError(f"Quality must be one of: {', '.join(valid_qualities)}")
            
        logger.info(f"Converting PDF to images (format: {format}, quality: {quality})")
        
        # Run conversion in background thread (may take time)
        zip_bytes = await asyncio.get_event_loop().run_in_executor(
            None, pdf_tools.pdf_to_images_zip_bytes, file_data
        )
        
        return StreamingResponse(
            io.BytesIO(zip_bytes), 
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=pdf_images.zip"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF to images conversion")

@router.post("/compress")
async def compress_pdf(
    file: UploadFile = File(...),
    level: str = Form("medium")
):
    """Compress PDF file with compression statistics."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate compression level
        level = ParameterValidator.validate_compression_level(level)
        logger.info(f"Compressing PDF with level: {level}")
        
        result = pdf_tools.compress_pdf_bytes(file_data, level)
        
        # Calculate compression statistics
        original_size = len(file_data)
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
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF compression")

@router.post("/metadata", response_model=PDFMetadataResponse)
async def get_pdf_metadata(file: UploadFile = File(...)):
    """Get comprehensive PDF metadata information."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        logger.info("Extracting PDF metadata")
        
        metadata = pdf_tools.get_pdf_metadata_bytes(file_data)
        
        return PDFMetadataResponse(
            filename=file.filename or "unknown.pdf",
            file_size=len(file_data),
            **metadata
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Metadata extraction")

# Health check endpoint for PDF service
@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for PDF processing service."""
    try:
        # Test basic PDF operations
        checks = {}
        
        # Test PDF library availability
        try:
            import PyPDF2, pikepdf, fitz
            checks["pdf_libraries"] = "ok"
        except ImportError as e:
            checks["pdf_libraries"] = f"error: {e}"
        
        # Test OCR capability
        try:
            import pytesseract
            checks["ocr"] = "ok"
        except ImportError:
            checks["ocr"] = "error: pytesseract not available"
        
        # Test image processing
        try:
            from PIL import Image
            checks["image_processing"] = "ok"
        except ImportError:
            checks["image_processing"] = "error: PIL not available"
        
        overall_status = "healthy" if all("error" not in status for status in checks.values()) else "degraded"
        
        return HealthResponse(
            status=overall_status,
            version=settings.app_version,
            checks=checks
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="unhealthy",
            version=settings.app_version,
            checks={"error": str(e)}
        )
