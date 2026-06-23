import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.pipeline.steps.data_processing import clean_transcript_pdf, extract_qa

router = APIRouter(prefix="/test/data-processing", tags=["Test Data Processing"])

@router.post("/chunk-pdf")
async def test_chunk_pdf(file: UploadFile = File(...)):
    """Test endpoint to directly upload a PDF transcript, clean it, and chunk it."""
    
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    content = await file.read()
    
    # Save to a temporary file because clean_transcript_pdf expects a file path
    temp_file_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            temp_file_path = tmp.name
            
        cleaned_text = clean_transcript_pdf(temp_file_path)
        chunks = extract_qa(cleaned_text)
        
        return {
            "status": "success",
            "filename": file.filename,
            "cleaned_text_length": len(cleaned_text),
            "chunks_extracted": len(chunks),
            "cleaned_text": cleaned_text,
            "chunks": chunks
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
