from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from typing import List, Optional
import io

from ..services import pdf_tools

router = APIRouter()

@router.post("/merge")
async def merge_pdfs(files: List[UploadFile] = File(...)):
    try:
        data = [await f.read() for f in files]
        out = pdf_tools.merge_pdfs_bytes(data)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=merged.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/reorder")
async def reorder_pdf(file: UploadFile = File(...), order: str = Form(...)):
    try:
        data = await file.read()
        out = pdf_tools.reorder_pdf_bytes(data, order)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=reordered.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/split")
async def split_pdf(file: UploadFile = File(...), ranges: Optional[str] = Form(None)):
    try:
        data = await file.read()
        parts = pdf_tools.split_pdf_bytes(data, ranges)
        # Return as a zip of files
        zip_bytes = pdf_tools.zip_named_files(parts)
        return StreamingResponse(io.BytesIO(zip_bytes), media_type="application/zip", headers={
            "Content-Disposition": "attachment; filename=split.zip"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/rotate")
async def rotate_pdf(file: UploadFile = File(...), degrees: int = Form(...)):
    try:
        data = await file.read()
        out = pdf_tools.rotate_pdf_bytes(data, degrees)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=rotated.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    try:
        data = await file.read()
        text = pdf_tools.extract_text_bytes(data)
        return JSONResponse({"text": text})
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/watermark")
async def add_watermark(file: UploadFile = File(...), watermark_text: str = Form(...), opacity: float = Form(0.2)):
    try:
        data = await file.read()
        out = pdf_tools.add_text_watermark_bytes(data, watermark_text, opacity)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=watermarked.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/pagenum")
async def add_page_numbers(file: UploadFile = File(...), position: str = Form("bottom-right")):
    try:
        data = await file.read()
        out = pdf_tools.add_page_numbers_bytes(data, position)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=numbered.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/protect")
async def protect_pdf(file: UploadFile = File(...), password: str = Form(...)):
    try:
        data = await file.read()
        out = pdf_tools.protect_pdf_bytes(data, password)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=protected.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/unlock")
async def unlock_pdf(file: UploadFile = File(...), password: str = Form(...)):
    try:
        data = await file.read()
        out = pdf_tools.unlock_pdf_bytes(data, password)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=unlocked.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/images-to-pdf")
async def images_to_pdf(files: List[UploadFile] = File(...)):
    try:
        data = [await f.read() for f in files]
        out = pdf_tools.images_to_pdf_bytes(data)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=images.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/pdf-to-images")
async def pdf_to_images(file: UploadFile = File(...)):
    try:
        data = await file.read()
        zip_bytes = pdf_tools.pdf_to_images_zip_bytes(data)
        return StreamingResponse(io.BytesIO(zip_bytes), media_type="application/zip", headers={
            "Content-Disposition": "attachment; filename=images.zip"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/compress")
async def compress_pdf(file: UploadFile = File(...), level: str = Form("medium")):
    try:
        data = await file.read()
        out = pdf_tools.compress_pdf_bytes(data, level)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=compressed.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/metadata")
async def edit_metadata(file: UploadFile = File(...), title: Optional[str] = Form(None), author: Optional[str] = Form(None)):
    try:
        data = await file.read()
        out = pdf_tools.edit_metadata_bytes(data, title=title, author=author)
        return StreamingResponse(io.BytesIO(out), media_type="application/pdf", headers={
            "Content-Disposition": "attachment; filename=metadata.pdf"
        })
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
