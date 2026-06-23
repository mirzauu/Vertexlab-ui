import os
import sys
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.pipeline.steps.matching import MatchingStep
from app.pipeline.base import PipelineContext

async def test_matching():
    print("1. Initializing MatchingStep and Mock Context...")
    step = MatchingStep()
    context = PipelineContext(
        task_id=uuid.uuid4(),
        organization_id=uuid.uuid4()
    )
    
    # Setup mock DB and Transcript
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_transcript = MagicMock()
    
    # Dummy Audio STT Segments (Chronological)
    mock_transcript.content = {
        "segments": [
            {"text": "my name is john doe", "start": 10.0, "end": 12.0, "speaker": "Speaker 1"},
            {"text": "okay please state your full name for the record", "start": 12.5, "end": 15.0, "speaker": "Speaker 2"},
            {"text": "yes my name is test user and i live in new york", "start": 15.5, "end": 19.0, "speaker": "Speaker 1"}
        ]
    }
    
    # Dummy PDF Chunks
    mock_transcript.chunks = [
        {"id": 1, "text": "Q. Okay, please state your full name for the record."},
        {"id": 2, "text": "A. Yes, my name is Test User and I live in New York."}
    ]
    
    mock_result.scalar_one_or_none.return_value = mock_transcript
    mock_db.execute.return_value = mock_result
    context.db = mock_db
    
    print("2. Executing step...")
    result_context = await step.execute(context)
    
    print("\n--- MATCHING SUMMARY ---")
    print(result_context.matching_result)
    
    print("\n--- MATCHED CHUNKS ---")
    for match in mock_transcript.matches:
        print(f"Chunk ID {match['raw_chunk_id']}: [{match['match_status']}] (Confidence: {match['confidence_score']}%)")
        print(f"   Raw Text:   '{match['raw_chunk_text']}'")
        print(f"   Audio Text: '{match['matched_audio_text']}'")
        print(f"   Time:       {match['audio_start_time_sec']} -> {match['audio_end_time_sec']}")
        print()
        
    print("✅ Test complete.")

if __name__ == "__main__":
    asyncio.run(test_matching())
