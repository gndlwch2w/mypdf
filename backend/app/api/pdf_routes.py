from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Optional
import io
import json
import logging
import asyncio
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

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


def attachment_disposition(filename: str) -> str:
    """Build an ASCII-safe attachment header while preserving a UTF-8 filename."""
    extension = "".join(
        character
        for character in Path(filename).suffix
        if character.isascii() and (character.isalnum() or character == ".")
    )
    fallback = f"download{extension}"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"

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
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as e:
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
    angle: int = Form(90),
    pages: str = Form("")
):
    """Keep or rotate all PDF pages or a comma-separated selection of pages."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate angle
        angle = ParameterValidator.validate_rotation_angle(angle)
        selected_pages = None
        if pages.strip():
            try:
                selected_pages = sorted({int(page.strip()) for page in pages.split(',') if page.strip()})
            except ValueError as error:
                raise ValidationError("Pages must be comma-separated page numbers") from error
            if not selected_pages or any(page < 1 for page in selected_pages):
                raise ValidationError("Page numbers must be positive integers")

        target = "all pages" if selected_pages is None else f"pages {selected_pages}"
        logger.info(f"Rotating {target} by {angle} degrees")
        
        result = pdf_tools.rotate_pdf_bytes(file_data, angle, selected_pages)
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=rotated.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as e:
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
    watermark_image: Optional[UploadFile] = File(None),
    watermark_type: str = Form("text"),
    watermark_text: str = Form(""),
    opacity: float = Form(0.3),
    position: str = Form("center-center"),
    mosaic: bool = Form(False),
    rotation: int = Form(45),
    font_family: str = Form("helvetica"),
    font_size: int = Form(48),
    bold: bool = Form(False),
    italic: bool = Form(False),
    underline: bool = Form(False),
    color: str = Form("#666666"),
    page_from: int = Form(1),
    page_to: Optional[int] = Form(None),
    layer: str = Form("over")
):
    """Add a configurable text or image watermark to PDF pages."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        image_data = await watermark_image.read() if watermark_image else None
        if watermark_type == "text" and not watermark_text.strip():
            raise ValidationError("Watermark text cannot be empty")
        if watermark_type == "image" and not image_data:
            raise ValidationError("Choose a watermark image")
        opacity = ParameterValidator.validate_opacity(opacity)
        if position not in {
            "top-left", "top-center", "top-right", "center-left", "center-center",
            "center-right", "bottom-left", "bottom-center", "bottom-right"
        }:
            raise ValidationError("Invalid watermark position")
        if rotation not in (0, 45, 90, 315):
            raise ValidationError("Watermark rotation must be 0, 45, 90, or 315 degrees")
        if layer not in ("over", "below"):
            raise ValidationError("Watermark layer must be over or below")
        if not 8 <= font_size <= 160:
            raise ValidationError("Font size must be between 8 and 160")

        result = pdf_tools.add_watermark_bytes(
            file_data=file_data,
            text=watermark_text,
            image_data=image_data if watermark_type == "image" else None,
            opacity=opacity,
            position=position,
            mosaic=mosaic,
            rotation=rotation,
            font_family=font_family,
            font_size=font_size,
            bold=bold,
            italic=italic,
            underline=underline,
            color=color,
            page_from=page_from,
            page_to=page_to,
            layer=layer,
        )
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=watermarked.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "Watermark addition")

@router.post("/edit")
async def edit_pdf(
    file: UploadFile = File(...),
    operations: str = Form(...),
    assets: Optional[List[UploadFile]] = File(None),
):
    """Apply text, image, shape, drawing and annotation edits to a PDF."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        try:
            edit_document = json.loads(operations)
        except json.JSONDecodeError as error:
            raise ValidationError("Invalid PDF edit operations") from error

        asset_data = {}
        for asset in assets or []:
            data = await asset.read()
            if not data:
                continue
            asset_id = Path(asset.filename or "").stem
            if asset_id:
                asset_data[asset_id] = data

        result = pdf_tools.edit_pdf_bytes(file_data, edit_document, asset_data)
        return StreamingResponse(
            io.BytesIO(result),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=edited.pdf"},
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise create_error_response(error, "PDF editing")


@router.post("/pagenum")
async def add_page_numbers(
    file: UploadFile = File(...),
    position: str = Form("bottom-right"),
    margin: str = Form("recommended"),
    first_number: int = Form(1),
    page_from: int = Form(1),
    page_to: Optional[int] = Form(None),
    text_format: str = Form("{n} / {p}"),
    font_family: str = Form("helvetica"),
    font_size: int = Form(12),
    bold: bool = Form(False),
    italic: bool = Form(False),
    underline: bool = Form(False),
    color: str = Form("#333333"),
):
    """Add styled page numbers to a selected page range."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        logger.info(f"Adding page numbers from page {page_from} to {page_to or 'last'}")

        result = pdf_tools.add_page_numbers_bytes(
            file_data,
            position=position,
            margin=margin,
            first_number=first_number,
            page_from=page_from,
            page_to=page_to,
            text_format=text_format,
            font_family=font_family,
            font_size=font_size,
            bold=bold,
            italic=italic,
            underline=underline,
            color=color,
        )
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=numbered.pdf"}
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as e:
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
    page_size: str = Form("A4"),
    orientation: str = Form("portrait"),
    margin: str = Form("none")
):
    """Convert multiple images to PDF."""
    try:
        files_data = await FileValidator.validate_multiple_files(files, "image")
        logger.info(f"Converting {len(files_data)} images to PDF (page size: {page_size})")
        
        result = pdf_tools.images_to_pdf_bytes(files_data, page_size, orientation, margin)
        
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
    mode: str = Form("pages"),
    format: str = Form("png"),
    quality: str = Form("medium")
):
    """Render PDF pages or extract embedded raster images."""
    try:
        file_data = await FileValidator.validate_pdf_file(file)
        # Validate conversion mode, format and quality
        valid_modes = ["pages", "extract"]
        valid_formats = ["png", "jpg", "jpeg"]
        valid_qualities = ["low", "medium", "high"]

        if mode not in valid_modes:
            raise ValidationError(f"Mode must be one of: {', '.join(valid_modes)}")
        if format not in valid_formats:
            raise ValidationError(f"Format must be one of: {', '.join(valid_formats)}")
        if quality not in valid_qualities:
            raise ValidationError(f"Quality must be one of: {', '.join(valid_qualities)}")

        logger.info(f"Converting PDF to images (mode: {mode}, format: {format}, quality: {quality})")

        operation = (
            pdf_tools.extract_pdf_images_zip_bytes
            if mode == "extract"
            else pdf_tools.pdf_to_images_zip_bytes
        )
        zip_bytes = await asyncio.get_event_loop().run_in_executor(
            None, operation, file_data, format, quality
        )

        filename = "extracted_images.zip" if mode == "extract" else "pdf_images.zip"
        return StreamingResponse(
            io.BytesIO(zip_bytes), 
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except (InvalidFileError, FileSizeError, ValidationError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise create_error_response(e, "PDF to images conversion")

@router.post("/compress")
async def compress_pdf(
    file: Optional[UploadFile] = File(None),
    files: Optional[List[UploadFile]] = File(None),
    level: str = Form("medium")
):
    """Compress one PDF directly or multiple PDFs as a ZIP batch."""
    try:
        uploads = list(files or [])
        if file is not None:
            uploads.insert(0, file)

        files_data = await FileValidator.validate_multiple_files(uploads, "PDF")
        # Validate compression level
        level = ParameterValidator.validate_compression_level(level)
        logger.info(f"Compressing {len(files_data)} PDF(s) with level: {level}")

        compressed_files = []
        for upload, file_data in zip(uploads, files_data):
            compressed_files.append((upload, pdf_tools.compress_pdf_bytes(file_data, level)))
        
        # Calculate compression statistics
        original_size = sum(len(file_data) for file_data in files_data)

        if len(compressed_files) == 1:
            result = compressed_files[0][1]
            media_type = "application/pdf"
            filename = "compressed.pdf"
        else:
            named_results = {}
            for index, (upload, result) in enumerate(compressed_files, start=1):
                source_name = Path(upload.filename or f"document-{index}.pdf").name
                stem = Path(source_name).stem or f"document-{index}"
                output_name = f"{stem}-compressed.pdf"
                if output_name in named_results:
                    output_name = f"{stem}-compressed-{index}.pdf"
                named_results[output_name] = result

            result = pdf_tools.zip_named_files(named_results)
            media_type = "application/zip"
            filename = "compressed-pdfs.zip"

        compressed_size = len(result)
        compression_ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0
        
        logger.info(f"Compression completed: {original_size} -> {compressed_size} bytes ({compression_ratio:.1f}% reduction)")
        
        return StreamingResponse(
            io.BytesIO(result), 
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
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


@router.post("/powerpoint")
async def convert_powerpoint(
    files: List[UploadFile] = File(...),
    output_mode: str = Form("electronic"),
):
    """Batch export PPT/PPTX files to PDFs or image-only flattened PPTX files."""
    try:
        if not files:
            raise InvalidFileError("Add at least one PowerPoint file")
        if len(files) > settings.max_files_count:
            raise ValidationError(f"A maximum of {settings.max_files_count} files can be processed at once")
        if output_mode not in {"electronic", "print", "flattened"}:
            raise ValidationError("Invalid PowerPoint output mode")

        outputs = []
        used_names = set()
        for index, file in enumerate(files):
            filename = Path(file.filename or f"presentation-{index + 1}.pptx").name
            if Path(filename).suffix.lower() not in {".ppt", ".pptx"}:
                raise InvalidFileError(f"{filename} must use the .ppt or .pptx extension")
            file_data = await file.read()
            if not file_data:
                raise InvalidFileError(f"{filename} is empty")
            if len(file_data) > settings.max_file_size_bytes:
                raise FileSizeError(f"{filename} exceeds the {settings.max_file_size_mb}MB limit")

            if output_mode == "flattened":
                result = pdf_tools.powerpoint_to_flattened_pptx_bytes(file_data, filename)
                extension = ".pptx"
                suffix = "flattened"
            else:
                result = pdf_tools.powerpoint_to_pdf_bytes(file_data, filename, output_mode)
                extension = ".pdf"
                suffix = output_mode
            output_name = f"{Path(filename).stem}_{suffix}{extension}"
            if output_name.lower() in used_names:
                output_name = f"{Path(filename).stem}_{suffix}_{index + 1}{extension}"
            used_names.add(output_name.lower())
            outputs.append((output_name, result))

        if len(outputs) > 1:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for output_name, result in outputs:
                    zip_file.writestr(output_name, result)
            result = archive.getvalue()
            media_type = "application/zip"
            output_name = "powerpoint-batch.zip"
        else:
            output_name, result = outputs[0]
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation" if output_mode == "flattened" else "application/pdf"

        return StreamingResponse(
            io.BytesIO(result),
            media_type=media_type,
            headers={"Content-Disposition": attachment_disposition(output_name)},
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise create_error_response(error, "PowerPoint conversion")


@router.post("/word")
async def convert_word(
    files: List[UploadFile] = File(...),
    output_mode: str = Form("electronic"),
):
    """Batch export DOC/DOCX files to electronic or print-quality PDFs."""
    try:
        if not files:
            raise InvalidFileError("Add at least one Word document")
        if len(files) > settings.max_files_count:
            raise ValidationError(f"A maximum of {settings.max_files_count} files can be processed at once")
        if output_mode not in {"electronic", "print"}:
            raise ValidationError("Invalid Word output mode")

        outputs = []
        used_names = set()
        for index, file in enumerate(files):
            filename = Path(file.filename or f"document-{index + 1}.docx").name
            if Path(filename).suffix.lower() not in {".doc", ".docx"}:
                raise InvalidFileError(f"{filename} must use the .doc or .docx extension")
            file_data = await file.read()
            if not file_data:
                raise InvalidFileError(f"{filename} is empty")
            if len(file_data) > settings.max_file_size_bytes:
                raise FileSizeError(f"{filename} exceeds the {settings.max_file_size_mb}MB limit")

            result = pdf_tools.word_to_pdf_bytes(file_data, filename, output_mode)
            output_name = f"{Path(filename).stem}_{output_mode}.pdf"
            if output_name.lower() in used_names:
                output_name = f"{Path(filename).stem}_{output_mode}_{index + 1}.pdf"
            used_names.add(output_name.lower())
            outputs.append((output_name, result))

        if len(outputs) > 1:
            archive = io.BytesIO()
            with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for output_name, result in outputs:
                    zip_file.writestr(output_name, result)
            result = archive.getvalue()
            media_type = "application/zip"
            output_name = "word-batch.zip"
        else:
            output_name, result = outputs[0]
            media_type = "application/pdf"

        return StreamingResponse(
            io.BytesIO(result),
            media_type=media_type,
            headers={"Content-Disposition": attachment_disposition(output_name)},
        )
    except (InvalidFileError, FileSizeError, ValidationError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise create_error_response(error, "Word conversion")

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
