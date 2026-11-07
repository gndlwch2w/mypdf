from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
import os
import logging
import sys
from datetime import datetime

# Import configuration and utilities
from .config.settings import settings
from .models.responses import ErrorResponse, HealthResponse
from .exceptions.custom_exceptions import PDFProcessingError

# Configure logging with settings
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(settings.log_file, encoding='utf-8') if settings.log_file else logging.NullHandler()
    ]
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown tasks."""
    # Initialization on startup
    logger.info(f"Starting {settings.app_name} v{settings.app_version}...")
    
    # Check necessary PDF processing libraries
    missing_libs = []
    try:
        import PyPDF2
        import pikepdf
        import fitz
        import pytesseract
        from PIL import Image
        logger.info("All PDF processing libraries loaded successfully")
    except ImportError as e:
        missing_libs.append(str(e))
        logger.error(f"Missing required library: {e}")
    
    if missing_libs:
        logger.warning(f"Some libraries are missing: {missing_libs}")
    
    # Application ready
    logger.info(f"Application startup completed. Running on {settings.host}:{settings.port}")
    
    yield
    
    # Cleanup on shutdown
    logger.info(f"Shutting down {settings.app_name}...")

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=settings.app_description,
    lifespan=lifespan,
    debug=settings.debug
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=settings.allowed_hosts
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Enhanced global exception handler for PDFProcessingError
@app.exception_handler(PDFProcessingError)
async def pdf_processing_exception_handler(request: Request, exc: PDFProcessingError):
    """Handle custom PDF processing exceptions."""
    logger.error(f"PDF processing error: {exc.message}", exc_info=True)
    
    # Map error types to HTTP status codes
    status_code = 400  # Bad Request by default
    if exc.error_code == "FILE_SIZE_EXCEEDED":
        status_code = 413  # Payload Too Large
    elif exc.error_code == "RESOURCE_NOT_FOUND":
        status_code = 404  # Not Found
    elif exc.error_code == "SERVICE_UNAVAILABLE":
        status_code = 503  # Service Unavailable
    
    error_response = ErrorResponse(
        message=exc.message,
        error_code=exc.error_code,
        details=exc.details
    )
    
    return JSONResponse(
        status_code=status_code,
        content=error_response.model_dump(mode="json")
    )

# Enhanced global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions with proper logging and response."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    error_response = ErrorResponse(
        message="An unexpected error occurred",
        error_code="INTERNAL_ERROR",
        details={"path": str(request.url)} if settings.debug else None
    )
    
    return JSONResponse(
        status_code=500,
        content=error_response.model_dump(mode="json")
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with consistent response format."""
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    
    error_response = ErrorResponse(
        message=exc.detail,
        error_code=f"HTTP_{exc.status_code}"
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump(mode="json")
    )

# Request logging middleware with performance monitoring
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log requests with timing and performance metrics."""
    start_time = datetime.now()
    
    # Log request start
    logger.info(f"Request: {request.method} {request.url}")
    
    response = await call_next(request)
    
    # Log request completion with metrics
    duration = (datetime.now() - start_time).total_seconds()
    log_level = logging.INFO if response.status_code < 400 else logging.WARNING
    logger.log(
        log_level,
        f"Response: {response.status_code} - Duration: {duration:.3f}s - Path: {request.url.path}"
    )
    
    # Add performance headers in debug mode
    if settings.debug:
        response.headers["X-Process-Time"] = str(duration)
    
    return response

# Import and register API routes
from .api import pdf_routes  # noqa: E402

# Register versioned API (recommended)
app.include_router(pdf_routes.router, prefix="/api/v1/pdf", tags=["PDF Tools v1"])

# Enhanced API status check with health information
@app.get("/api/status", response_model=HealthResponse, tags=["System"])
async def api_status():
    """Comprehensive API status and health check."""
    
    # Perform basic health checks
    checks = {
        "database": "ok",  # No database in this app
        "api": "ok",
        "dependencies": "ok"
    }
    
    # Check critical dependencies
    try:
        import PyPDF2, pikepdf, fitz
        checks["pdf_libraries"] = "ok"
    except ImportError:
        checks["pdf_libraries"] = "error"
    
    # Overall status
    overall_status = "healthy" if all(status == "ok" for status in checks.values()) else "degraded"
    
    return HealthResponse(
        status=overall_status,
        version=settings.app_version,
        checks=checks
    )

