"""
Application configuration settings.
Centralized configuration management for better maintainability and extensibility.
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional
import os


class AppSettings(BaseModel):
    """Main application settings configuration."""
    
    # Application metadata
    app_name: str = Field(default="MyPDF - Local PDF Tools", description="Application name")
    app_version: str = Field(default="1.0.0", description="Application version")
    app_description: str = Field(
        default="A local PDF processing application with privacy-focused tools",
        description="Application description"
    )
    
    # Server configuration
    host: str = Field(default="127.0.0.1", description="Server host")
    port: int = Field(default=8000, description="Server port")
    debug: bool = Field(default=False, description="Debug mode")
    
    # Security settings
    allowed_hosts: List[str] = Field(
        default=["127.0.0.1", "localhost", "*.localhost"],
        description="Allowed hosts for trusted host middleware"
    )
    cors_origins: List[str] = Field(
        default=["http://127.0.0.1:8000", "http://localhost:8000"],
        description="Allowed CORS origins"
    )
    
    # File handling limits
    max_file_size_mb: int = Field(default=50, description="Maximum file size in MB")
    max_files_count: int = Field(default=20, description="Maximum number of files for batch operations")
    
    # Processing settings
    default_image_dpi: int = Field(default=300, description="Default DPI for image processing")
    default_compression_level: str = Field(default="medium", description="Default PDF compression level")
    
    # Logging configuration
    log_level: str = Field(default="INFO", description="Logging level")
    log_file: Optional[str] = Field(default="app.log", description="Log file path")
    
    # Frontend configuration
    frontend_dir: str = Field(default="../../frontend", description="Frontend directory path")
    
    @validator('max_file_size_mb')
    def validate_max_file_size(cls, v):
        """Validate maximum file size is reasonable."""
        if v <= 0 or v > 1000:  # Maximum 1GB
            raise ValueError("max_file_size_mb must be between 1 and 1000")
        return v
    
    @validator('max_files_count')
    def validate_max_files_count(cls, v):
        """Validate maximum files count is reasonable."""
        if v <= 0 or v > 100:
            raise ValueError("max_files_count must be between 1 and 100")
        return v
    
    @validator('default_compression_level')
    def validate_compression_level(cls, v):
        """Validate compression level is valid."""
        valid_levels = ['low', 'medium', 'high']
        if v not in valid_levels:
            raise ValueError(f"default_compression_level must be one of: {valid_levels}")
        return v
    
    @property
    def max_file_size_bytes(self) -> int:
        """Get maximum file size in bytes."""
        return self.max_file_size_mb * 1024 * 1024


# Load settings from environment variables with defaults
def load_settings() -> AppSettings:
    """Load application settings from environment variables."""
    return AppSettings(
        app_name=os.getenv("MYPDF_APP_NAME", "MyPDF - Local PDF Tools"),
        app_version=os.getenv("MYPDF_APP_VERSION", "1.0.0"),
        app_description=os.getenv("MYPDF_APP_DESCRIPTION", "A local PDF processing application with privacy-focused tools"),
        host=os.getenv("MYPDF_HOST", "127.0.0.1"),
        port=int(os.getenv("MYPDF_PORT", "8000")),
        debug=os.getenv("MYPDF_DEBUG", "false").lower() == "true",
        allowed_hosts=os.getenv("MYPDF_ALLOWED_HOSTS", "127.0.0.1,localhost,*.localhost").split(","),
        cors_origins=os.getenv("MYPDF_CORS_ORIGINS", "http://127.0.0.1:8000,http://localhost:8000").split(","),
        max_file_size_mb=int(os.getenv("MYPDF_MAX_FILE_SIZE_MB", "50")),
        max_files_count=int(os.getenv("MYPDF_MAX_FILES_COUNT", "20")),
        default_image_dpi=int(os.getenv("MYPDF_DEFAULT_IMAGE_DPI", "300")),
        default_compression_level=os.getenv("MYPDF_DEFAULT_COMPRESSION_LEVEL", "medium"),
        log_level=os.getenv("MYPDF_LOG_LEVEL", "INFO"),
        log_file=os.getenv("MYPDF_LOG_FILE", "app.log"),
        frontend_dir=os.getenv("MYPDF_FRONTEND_DIR", "../../frontend")
    )


# Global settings instance
settings = load_settings()