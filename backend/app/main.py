from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from typing import List, Optional
import io
import os

app = FastAPI(title="Local iLovePDF", version="0.1.0")

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static frontend
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend"))

# Mount static files for CSS, JS and other static resources
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# Service imports
from .api import pdf_routes  # noqa: E402
app.include_router(pdf_routes.router, prefix="/api/pdf")

# Root route
@app.get("/")
async def serve_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Frontend not found")

# Handle frontend routes - serve index.html for all non-API, non-static routes
@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    # If it's an API request, let it 404 naturally
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    
    # If it's a static file request (css, js, images, etc.), serve it directly
    if "." in full_path:  # Files with extensions
        file_path = os.path.join(FRONTEND_DIR, full_path)
        if os.path.exists(file_path):
            # Determine media type based on file extension
            if full_path.endswith('.css'):
                return FileResponse(file_path, media_type="text/css")
            elif full_path.endswith('.js'):
                return FileResponse(file_path, media_type="application/javascript")
            elif full_path.endswith('.html'):
                return FileResponse(file_path, media_type="text/html")
            elif full_path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico')):
                return FileResponse(file_path)
            else:
                return FileResponse(file_path)
        raise HTTPException(status_code=404, detail="File not found")
    
    # For all other routes (tool routes without extensions), serve index.html
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    raise HTTPException(status_code=404, detail="Frontend not found")
