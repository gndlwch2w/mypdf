"""
Validation utilities for input validation and file handling.
Provides centralized validation logic for better maintainability.
"""

from fastapi import UploadFile, HTTPException
from typing import List, Optional, Union
import io
import logging

# Optional import for MIME type detection
try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
from ..config.settings import settings
from ..exceptions.custom_exceptions import (
    InvalidFileError, 
    FileSizeError, 
    ValidationError
)

logger = logging.getLogger(__name__)


class FileValidator:
    """Validator for uploaded files with comprehensive validation logic."""
    
    # Supported file types with their MIME types and extensions
    SUPPORTED_PDF_TYPES = {
        'application/pdf': ['.pdf'],
    }
    
    SUPPORTED_IMAGE_TYPES = {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/bmp': ['.bmp'],
        'image/tiff': ['.tiff', '.tif'],
        'image/gif': ['.gif'],
        'image/webp': ['.webp']
    }
    
    @staticmethod
    async def validate_pdf_file(file: UploadFile, max_size: Optional[int] = None) -> bytes:
        """
        Validate and read a PDF file.
        
        Args:
            file: Uploaded file to validate
            max_size: Maximum file size in bytes (defaults to settings)
            
        Returns:
            bytes: File content if valid
            
        Raises:
            InvalidFileError: If file is not a valid PDF
            FileSizeError: If file exceeds size limits
        """
        return await FileValidator._validate_file(
            file, 
            FileValidator.SUPPORTED_PDF_TYPES,
            max_size or settings.max_file_size_bytes,
            "PDF"
        )
    
    @staticmethod
    async def validate_image_file(file: UploadFile, max_size: Optional[int] = None) -> bytes:
        """
        Validate and read an image file.
        
        Args:
            file: Uploaded file to validate
            max_size: Maximum file size in bytes (defaults to settings)
            
        Returns:
            bytes: File content if valid
            
        Raises:
            InvalidFileError: If file is not a valid image
            FileSizeError: If file exceeds size limits
        """
        return await FileValidator._validate_file(
            file,
            FileValidator.SUPPORTED_IMAGE_TYPES,
            max_size or settings.max_file_size_bytes,
            "image"
        )
    
    @staticmethod
    async def validate_multiple_files(
        files: List[UploadFile], 
        file_type: str = "PDF",
        max_files: Optional[int] = None
    ) -> List[bytes]:
        """
        Validate multiple uploaded files.
        
        Args:
            files: List of uploaded files
            file_type: Expected file type ("PDF" or "image")
            max_files: Maximum number of files (defaults to settings)
            
        Returns:
            List[bytes]: List of validated file contents
            
        Raises:
            ValidationError: If validation fails
        """
        if not files:
            raise ValidationError("No files provided")
        
        max_count = max_files or settings.max_files_count
        if len(files) > max_count:
            raise ValidationError(f"Too many files. Maximum is {max_count} files")
        
        files_data = []
        validator = (FileValidator.validate_pdf_file 
                    if file_type.upper() == "PDF" 
                    else FileValidator.validate_image_file)
        
        for i, file in enumerate(files):
            try:
                data = await validator(file)
                files_data.append(data)
            except (InvalidFileError, FileSizeError) as e:
                raise ValidationError(f"File {i+1}: {e.message}")
        
        return files_data
    
    @staticmethod
    async def _validate_file(
        file: UploadFile, 
        supported_types: dict, 
        max_size: int,
        file_type_name: str
    ) -> bytes:
        """
        Internal method to validate a single file.
        
        Args:
            file: Uploaded file to validate
            supported_types: Dictionary of supported MIME types and extensions
            max_size: Maximum file size in bytes
            file_type_name: Human-readable file type name
            
        Returns:
            bytes: File content if valid
            
        Raises:
            InvalidFileError: If file is invalid
            FileSizeError: If file exceeds size limits
        """
        if not file.filename:
            raise InvalidFileError("No filename provided")
        
        # Check file extension
        file_ext = '.' + file.filename.lower().split('.')[-1] if '.' in file.filename else ''
        valid_extensions = [ext for exts in supported_types.values() for ext in exts]
        
        if file_ext not in valid_extensions:
            raise InvalidFileError(
                f"File must be a {file_type_name}. Supported extensions: {', '.join(valid_extensions)}"
            )
        
        # Read file data
        try:
            data = await file.read()
        except Exception as e:
            logger.error(f"Failed to read file {file.filename}: {e}")
            raise InvalidFileError("Failed to read file content")
        
        # Check file size
        if len(data) > max_size:
            max_size_mb = max_size // (1024 * 1024)
            raise FileSizeError(f"File too large. Maximum size is {max_size_mb}MB")
        
        if len(data) == 0:
            raise InvalidFileError("Empty file")
        
        # Validate MIME type if magic is available
        if MAGIC_AVAILABLE:
            try:
                detected_mime = magic.from_buffer(data, mime=True)
                if detected_mime not in supported_types:
                    raise InvalidFileError(
                        f"Invalid {file_type_name} file. Detected type: {detected_mime}"
                    )
            except Exception as e:
                logger.warning(f"MIME type detection failed for {file.filename}: {e}")
                # Continue without MIME validation if magic fails
        
        return data


class ParameterValidator:
    """Validator for API parameters and options."""
    
    @staticmethod
    def validate_page_ranges(ranges: Optional[str], total_pages: int) -> str:
        """
        Validate and normalize page ranges string.
        
        Args:
            ranges: Page ranges string (e.g., "1-3,5,7-")
            total_pages: Total number of pages in document
            
        Returns:
            str: Validated ranges string
            
        Raises:
            ValidationError: If ranges are invalid
        """
        if not ranges:
            return f"1-{total_pages}"
        
        try:
            # Basic validation of range format
            for part in ranges.split(','):
                part = part.strip()
                if not part:
                    continue
                
                if '-' in part:
                    start_str, end_str = part.split('-', 1)
                    start = int(start_str) if start_str.strip() else 1
                    end = int(end_str) if end_str.strip() else total_pages
                    
                    if start < 1 or end > total_pages or start > end:
                        raise ValidationError(f"Invalid range: {part}")
                else:
                    page = int(part)
                    if page < 1 or page > total_pages:
                        raise ValidationError(f"Page {page} out of range 1-{total_pages}")
            
            return ranges
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValidationError("Invalid range format. Use format like '1-3,5,7-'")
            raise ValidationError(str(e))
    
    @staticmethod
    def validate_rotation_angle(angle: int) -> int:
        """
        Validate rotation angle.
        
        Args:
            angle: Rotation angle in degrees
            
        Returns:
            int: Validated angle
            
        Raises:
            ValidationError: If angle is invalid
        """
        if angle not in [90, 180, 270]:
            raise ValidationError("Rotation angle must be 90, 180, or 270 degrees")
        return angle
    
    @staticmethod
    def validate_opacity(opacity: float) -> float:
        """
        Validate opacity value.
        
        Args:
            opacity: Opacity value
            
        Returns:
            float: Validated opacity
            
        Raises:
            ValidationError: If opacity is invalid
        """
        if not 0.0 <= opacity <= 1.0:
            raise ValidationError("Opacity must be between 0.0 and 1.0")
        return opacity
    
    @staticmethod
    def validate_compression_level(level: str) -> str:
        """
        Validate compression level.
        
        Args:
            level: Compression level
            
        Returns:
            str: Validated compression level
            
        Raises:
            ValidationError: If level is invalid
        """
        valid_levels = ['low', 'medium', 'high']
        if level not in valid_levels:
            raise ValidationError(f"Compression level must be one of: {', '.join(valid_levels)}")
        return level
    
    @staticmethod
    def validate_position(position: str, valid_positions: List[str]) -> str:
        """
        Validate position parameter.
        
        Args:
            position: Position value
            valid_positions: List of valid positions
            
        Returns:
            str: Validated position
            
        Raises:
            ValidationError: If position is invalid
        """
        if position not in valid_positions:
            raise ValidationError(f"Position must be one of: {', '.join(valid_positions)}")
        return position
    
    @staticmethod
    def validate_password(password: str) -> str:
        """
        Validate password.
        
        Args:
            password: Password string
            
        Returns:
            str: Validated password
            
        Raises:
            ValidationError: If password is invalid
        """
        if not password or not password.strip():
            raise ValidationError("Password cannot be empty")
        return password.strip()