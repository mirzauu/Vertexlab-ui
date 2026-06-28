"""
Speech-to-Text pipeline step using Deepgram.
"""

import os
from deepgram import DeepgramClient
from app.pipeline.base import BasePipelineStep, PipelineContext
from app.config import settings

class STTStep(BasePipelineStep):
    """Convert audio files to text transcripts."""

    @property
    def name(self) -> str:
        return "stt"

    async def execute(self, context: PipelineContext) -> PipelineContext:
        if not context.audio_file_path:
            raise ValueError("No audio file provided for STT step")

        # Construct absolute path to audio file
        # The file_path in DB is usually 'audio/filename.mp3', so we prepend STORAGE_PATH
        full_path = os.path.join(settings.STORAGE_PATH, context.audio_file_path)
        absolute_audio_path = os.path.abspath(full_path)
        
        if not os.path.exists(absolute_audio_path):
            raise FileNotFoundError(f"Audio file not found at {absolute_audio_path}")

        # Initialize Deepgram client
        client = DeepgramClient(api_key=settings.DEEPGRAM_API_KEY)

        # Transcribe
        with open(absolute_audio_path, "rb") as audio_file:
            response = client.listen.v1.media.transcribe_file(
                request=audio_file.read(),
                model="nova-3",
                smart_format=True
            )

        # Parse results
        result = response.results.channels[0].alternatives[0]
        
        # Build segments list from words or paragraphs if needed
        # We will extract basic segments from the words for demonstration
        segments = []
        if hasattr(result, 'words') and result.words:
            if hasattr(result, 'paragraphs') and result.paragraphs and hasattr(result.paragraphs, 'paragraphs') and getattr(result.paragraphs, 'paragraphs'):
                for para in result.paragraphs.paragraphs:
                    speaker = f"Speaker {getattr(para, 'speaker', 1)}"
                    
                    # Deepgram v3 stores text in sentences
                    text = getattr(para, "text", "")
                    if not text and hasattr(para, "sentences"):
                        text = " ".join([getattr(s, "text", "") for s in para.sentences])
                    
                    segments.append({
                        "start": getattr(para, "start", 0.0),
                        "end": getattr(para, "end", getattr(para, "start", 0.0) + 1.0),
                        "timestamp": str(getattr(para, "start", 0.0)),
                        "speaker": speaker,
                        "text": text
                    })
            else:
                segments.append({
                    "start": 0.0,
                    "end": 0.0,
                    "timestamp": "0.0",
                    "speaker": "Speaker 1",
                    "text": result.transcript
                })
        else:
             segments.append({
                "timestamp": "0.0",
                "speaker": "Speaker 1",
                "text": result.transcript
            })

        context.transcript = {
            "segments": segments,
            "language": "en", # Defaulting as deepgram response might not explicitly give top level language unless requested
            "confidence": result.confidence,
        }

        context.metadata["stt"] = {
            "segments_count": len(segments),
            "language": "en",
            "confidence": result.confidence,
        }

        # Persist STT output to DB immediately so downstream steps
        # (especially MatchingStep) can read it from the Transcript table
        # instead of relying on the in-memory context fallback.
        if context.db:
            from sqlalchemy import select
            from app.models.transcript import Transcript

            result_row = await context.db.execute(
                select(Transcript).where(Transcript.task_id == context.task_id)
            )
            existing = result_row.scalar_one_or_none()

            if existing:
                existing.content = {"segments": segments}
                existing.language = "en"
                existing.confidence_score = result.confidence
            else:
                new_transcript = Transcript(
                    task_id=context.task_id,
                    content={"segments": segments},
                    language="en",
                    confidence_score=result.confidence,
                )
                context.db.add(new_transcript)
            # Orchestrator will commit after step completes

        return context

