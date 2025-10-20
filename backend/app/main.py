from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from contextlib import asynccontextmanager
from typing import List, Optional
import io
import os
import logging
import sys
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('app.log', encoding='utf-8')
    ]
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialization on startup
    logger.info("Starting MyPDF application...")
    
    # Check frontend files
    frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))
    index_path = os.path.join(frontend_dir, "index.html")
    if not os.path.exists(index_path):
        logger.error(f"Frontend index.html not found at {index_path}")
    else:
        logger.info(f"Frontend found at {frontend_dir}")
    
    # Check necessary tool libraries
    try:
        import PyPDF2
        import pikepdf
        import fitz
        import pytesseract
        from PIL import Image
        logger.info("All PDF processing libraries loaded successfully")
    except ImportError as e:
        logger.error(f"Missing required library: {e}")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down MyPDF application...")

app = FastAPI(
    title="MyPDF - Local PDF Tools", 
    version="1.0.0",
    description="A local PDF processing application with privacy-focused tools",
    lifespan=lifespan
)

# Security middleware
app.add_middleware(
    TrustedHostMiddleware, 
    allowed_hosts=["127.0.0.1", "localhost", "*.localhost"]
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Static files configuration
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))

# Mount static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred",
            "timestamp": datetime.now().isoformat()
        }
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "Request failed",
            "message": exc.detail,
            "timestamp": datetime.now().isoformat()
        }
    )

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = datetime.now()
    
    # Log request start
    logger.info(f"Request: {request.method} {request.url}")
    
    response = await call_next(request)
    
    # Log request completion
    duration = (datetime.now() - start_time).total_seconds()
    logger.info(f"Response: {response.status_code} - Duration: {duration:.3f}s")
    
    return response

# Import service routes
from .api import pdf_routes  # noqa: E402
app.include_router(pdf_routes.router, prefix="/api/pdf", tags=["PDF Tools"])

# Root route
@app.get("/", response_class=HTMLResponse, tags=["Frontend"])
async def serve_index():
    """Service homepage"""
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    logger.error(f"Frontend index.html not found at {index_path}")
    raise HTTPException(status_code=404, detail="Frontend not found")

# API status check
@app.get("/api/status", tags=["System"])
async def api_status():
    """API status check"""
    return JSONResponse({
        "status": "operational",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
        "service": "MyPDF API"
    })

# Handle frontend routing - serve index.html for all non-API, non-static routes
@app.get("/{full_path:path}", response_class=HTMLResponse, tags=["Frontend"])
async def serve_frontend(request: Request, full_path: str):
    """Handle frontend routing and static files"""
    # If it's an API request, let it naturally 404
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    # If it's a static file request (css, js, images, etc.), serve directly
    if "." in full_path:  # Files with extension
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if os.path.exists(file_path):
            # Determine media type based on file extension
            media_types = {
                '.css': "text/css",
                '.js': "application/javascript", 
                '.html': "text/html",
                '.png': "image/png",
                '.jpg': "image/jpeg",
                '.jpeg': "image/jpeg",
                '.gif': "image/gif",
                '.svg': "image/svg+xml",
                '.ico': "image/x-icon",
                '.woff': "font/woff",
                '.woff2': "font/woff2",
                '.ttf': "font/ttf",
                '.eot': "application/vnd.ms-fontobject"
            }
            
            ext = '.' + full_path.split('.')[-1].lower()
            media_type = media_types.get(ext, "application/octet-stream")
            
            return FileResponse(file_path, media_type=media_type)
        
        logger.warning(f"Static file not found: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    
    # For all other routes (tool routes without extension), serve index.html
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    logger.error(f"Frontend index.html not found at {index_path}")
    raise HTTPException(status_code=404, detail="Frontend not found")
