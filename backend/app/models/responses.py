"""
Response models and schemas for API consistency.
Standardized response formats for better API interface stability.
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from enum import Enum


class ResponseStatus(str, Enum):
    """Standard response status values."""
    SUCCESS = "success"
    ERROR = "error"
    WARNING = "warning"


class BaseResponse(BaseModel):
    """Base response model for all API responses."""
    status: ResponseStatus = Field(description="Response status")
    message: str = Field(description="Response message")
    timestamp: datetime = Field(default_factory=datetime.now, description="Response timestamp")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class ErrorResponse(BaseResponse):
    """Error response model."""
    status: ResponseStatus = ResponseStatus.ERROR
    error_code: Optional[str] = Field(None, description="Specific error code")
    details: Optional[Dict[str, Any]] = Field(None, description="Additional error details")


class SuccessResponse(BaseResponse):
    """Success response model."""
    status: ResponseStatus = ResponseStatus.SUCCESS
    data: Optional[Dict[str, Any]] = Field(None, description="Response data")


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str = Field(description="Service status")
    version: str = Field(description="Application version")
    timestamp: datetime = Field(default_factory=datetime.now)
    checks: Dict[str, str] = Field(description="Health check results")
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PDFMetadataResponse(BaseModel):
    """PDF metadata response model."""
    filename: str = Field(description="Original filename")
    pages: int = Field(description="Number of pages")
    title: Optional[str] = Field(None, description="Document title")
    author: Optional[str] = Field(None, description="Document author")
    subject: Optional[str] = Field(None, description="Document subject")
    creator: Optional[str] = Field(None, description="Document creator")
    producer: Optional[str] = Field(None, description="Document producer")
    creation_date: Optional[str] = Field(None, description="Creation date")
    modification_date: Optional[str] = Field(None, description="Modification date")
    is_encrypted: bool = Field(description="Whether document is encrypted")
    file_size: int = Field(description="File size in bytes")


class TextExtractionResponse(BaseModel):
    """Text extraction response model."""
    text: str = Field(description="Extracted text content")
    filename: str = Field(description="Original filename")
    pages_processed: int = Field(description="Number of pages processed")
    extraction_method: str = Field(description="Extraction method used (direct/ocr/mixed)")
    timestamp: datetime = Field(default_factory=datetime.now)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class CompressionResponse(BaseModel):
    """PDF compression response with statistics."""
    original_size: int = Field(description="Original file size in bytes")
    compressed_size: int = Field(description="Compressed file size in bytes")
    compression_ratio: float = Field(description="Compression ratio percentage")
    level: str = Field(description="Compression level used")


class ProcessingOptions(BaseModel):
    """Base model for processing options."""
    pass


class SplitOptions(ProcessingOptions):
    """Options for PDF splitting operation."""
    ranges: Optional[str] = Field(None, description="Page ranges (e.g., '1-3,5,7-')")


class RotateOptions(ProcessingOptions):
    """Options for PDF rotation operation."""
    angle: int = Field(90, description="Rotation angle (90, 180, or 270)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "angle": 90
            }
        }


class WatermarkOptions(ProcessingOptions):
    """Options for watermark operation."""
    text: str = Field("WATERMARK", description="Watermark text")
    opacity: float = Field(0.3, ge=0.0, le=1.0, description="Watermark opacity (0.0-1.0)")
    position: str = Field("center", description="Watermark position")


class PageNumberOptions(ProcessingOptions):
    """Options for page numbering operation."""
    position: str = Field("bottom-right", description="Page number position")


class ImageConversionOptions(ProcessingOptions):
    """Options for image conversion operations."""
    format: str = Field("png", description="Output image format")
    quality: str = Field("medium", description="Output quality")
    dpi: Optional[int] = Field(None, description="Output DPI")


class CompressionOptions(ProcessingOptions):
    """Options for PDF compression."""
    level: str = Field("medium", description="Compression level (low/medium/high)")


# API versioning support
class APIVersion(str, Enum):
    """Supported API versions."""
    V1 = "v1"


class VersionedResponse(BaseModel):
    """Response with API version information."""
    api_version: APIVersion = Field(APIVersion.V1, description="API version")
    data: Union[BaseResponse, Dict[str, Any]] = Field(description="Response data")