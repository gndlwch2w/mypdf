"""
Custom exception classes for better error handling and debugging.
Provides structured error handling with appropriate HTTP status codes.
"""

from typing import Optional, Dict, Any


class PDFProcessingError(Exception):
    """Base exception for PDF processing operations."""
    
    def __init__(
        self, 
        message: str, 
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details = details or {}


class InvalidFileError(PDFProcessingError):
    """Raised when the uploaded file is invalid or corrupted."""
    
    def __init__(self, message: str = "Invalid file format", **kwargs):
        super().__init__(message, error_code="INVALID_FILE", **kwargs)


class FileSizeError(PDFProcessingError):
    """Raised when file size exceeds limits."""
    
    def __init__(self, message: str = "File size exceeds limit", **kwargs):
        super().__init__(message, error_code="FILE_SIZE_EXCEEDED", **kwargs)


class PasswordError(PDFProcessingError):
    """Raised when PDF password operations fail."""
    
    def __init__(self, message: str = "Password operation failed", **kwargs):
        super().__init__(message, error_code="PASSWORD_ERROR", **kwargs)


class ProcessingError(PDFProcessingError):
    """Raised when PDF processing operations fail."""
    
    def __init__(self, message: str = "Processing operation failed", **kwargs):
        super().__init__(message, error_code="PROCESSING_ERROR", **kwargs)


class ValidationError(PDFProcessingError):
    """Raised when input validation fails."""
    
    def __init__(self, message: str = "Input validation failed", **kwargs):
        super().__init__(message, error_code="VALIDATION_ERROR", **kwargs)


class ResourceNotFoundError(PDFProcessingError):
    """Raised when required resources are not found."""
    
    def __init__(self, message: str = "Required resource not found", **kwargs):
        super().__init__(message, error_code="RESOURCE_NOT_FOUND", **kwargs)


class ServiceUnavailableError(PDFProcessingError):
    """Raised when external services are unavailable."""
    
    def __init__(self, message: str = "Service temporarily unavailable", **kwargs):
        super().__init__(message, error_code="SERVICE_UNAVAILABLE", **kwargs)