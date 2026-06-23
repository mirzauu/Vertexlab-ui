from fastapi import APIRouter, UploadFile, File
from deepgram import DeepgramClient
from app.config import settings

router = APIRouter(prefix="/test/stt", tags=["Test STT"])

@router.post("/transcribe")
async def test_transcribe(file: UploadFile = File(...)):
    """Test endpoint to directly upload audio and transcribe via Deepgram."""
    client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)
    content = await file.read()
    
    response = client.listen.v1.media.transcribe_file(
        request=content,
        model="nova-3",
        smart_format=True,
        diarize=True,
        numerals=False
    )
    
    result = response.results.channels[0].alternatives[0]
    
    chunks = []
    if hasattr(result, 'paragraphs') and result.paragraphs and result.paragraphs.paragraphs:
        for i, para in enumerate(result.paragraphs.paragraphs):
            # Format speaker as SPEAKER_00, SPEAKER_01, etc.
            speaker_id = getattr(para, 'speaker', 0)
            speaker_label = f"SPEAKER_{int(speaker_id):02d}"
            
            # Reconstruct paragraph text from its sentences
            para_text = ""
            if hasattr(para, 'sentences') and para.sentences:
                para_text = " ".join(s.text for s in para.sentences if hasattr(s, 'text') and s.text).strip()
            
            chunks.append({
                "raw_chunk_id": i + 1,
                "raw_chunk_text": para_text,
                "audio_start_time_sec": para.start,
                "audio_end_time_sec": para.end,
                "speakers": [speaker_label]
            })
    else:
        # Fallback if no paragraphs are returned
        end_time = 0.0
        if hasattr(result, 'words') and result.words:
            end_time = result.words[-1].end
            
        chunks.append({
            "raw_chunk_id": 1,
            "raw_chunk_text": result.transcript,
            "audio_start_time_sec": 0.0,
            "audio_end_time_sec": end_time,
            "speakers": ["SPEAKER_00"]
        })
    
    return chunks
