"""
Document generation pipeline step.
Uses OpenAI to correct grammar/spelling by comparing raw_chunk_text
and matched_audio_text, producing corrected text with timelines.
"""

import asyncio
import json
import logging
from openai import AsyncOpenAI

from app.pipeline.base import BasePipelineStep, PipelineContext
from app.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 15
MAX_CONCURRENT = 5

SYSTEM_PROMPT = """You are a legal document proofreader and corrector. You will receive a JSON array of matched deposition entries. Each entry has:
- "raw_chunk_id": the chunk identifier
- "raw_chunk_text": the original stenographic/typed text (may contain typos, OCR errors, jumbled words)
- "matched_audio_text": the audio transcription of the same segment (may contain mishearings but captures the actual spoken words)

Your task:
1. Compare both versions of each entry.
2. Produce the BEST corrected version of the raw_chunk_text by:
   - Fixing grammar, spelling, and punctuation errors
   - Using the audio text to resolve ambiguous or garbled words in the raw text
   - Preserving the Q: / A: format exactly
   - Preserving legal terminology, proper nouns, and case references exactly
   - Keeping parenthetical objections (e.g., "(Objection: ...)") intact
3. Do NOT add information that isn't in either source.
4. Do NOT remove content — correct it.

Return ONLY a valid JSON object with a single key "corrections", which contains an array where each element has:
- "raw_chunk_id": same as input
- "corrected_text": your corrected version of the raw_chunk_text

No extra commentary, no markdown fences, ONLY the JSON object."""


class DocumentGenerationStep(BasePipelineStep):
    """Generate AI-corrected documents from matched data using OpenAI."""

    @property
    def name(self) -> str:
        return "document_generation"

    async def execute(self, context: PipelineContext) -> PipelineContext:
        matching_result = context.matching_result
        if not matching_result or "matches" not in matching_result:
            logger.warning("No matching results found. Skipping document generation.")
            context.generated_document = {
                "title": "AI-Corrected Proof Document",
                "content": "No matching data available for correction.",
                "version": 1,
                "is_draft": True,
                "corrected_chunks": [],
            }
            return context

        all_matches = matching_result["matches"]

        # Filter to only chunks that have matched_audio_text (non-null)
        correctable = [
            m for m in all_matches
            if m.get("matched_audio_text")
        ]

        logger.info(
            f"Document generation: {len(correctable)} correctable chunks "
            f"out of {len(all_matches)} total (filtered out empty/interpolated)"
        )

        if not correctable:
            logger.warning("No correctable chunks found.")
            context.generated_document = {
                "title": "AI-Corrected Proof Document",
                "content": "No correctable chunks available.",
                "version": 1,
                "is_draft": True,
                "corrected_chunks": [],
            }
            return context

        # Prepare batches of 15 chunks each
        batches = []
        for i in range(0, len(correctable), BATCH_SIZE):
            batch = correctable[i : i + BATCH_SIZE]
            batches.append(batch)

        logger.info(f"Processing {len(batches)} batches (batch size={BATCH_SIZE})")

        # Initialize OpenAI client
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)

        async def process_batch(batch: list[dict], batch_idx: int) -> list[dict]:
            """Send a batch to OpenAI and parse the corrected results."""
            async with semaphore:
                # Build the input payload for this batch
                input_entries = [
                    {
                        "raw_chunk_id": m["raw_chunk_id"],
                        "raw_chunk_text": m["raw_chunk_text"],
                        "matched_audio_text": m["matched_audio_text"],
                    }
                    for m in batch
                ]

                try:
                    logger.info(f"  📤 Sending batch {batch_idx + 1}/{len(batches)} ({len(batch)} chunks)")

                    response = await client.chat.completions.create(
                        model=settings.OPENAI_MODEL,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": json.dumps(input_entries, ensure_ascii=False)},
                        ],
                        response_format={"type": "json_object"},
                    )

                    raw_response = response.choices[0].message.content.strip()

                    # Parse AI response
                    parsed = json.loads(raw_response)

                    # Handle both {"corrections": [...]} and direct [...]
                    if isinstance(parsed, dict):
                        corrections = parsed.get("corrections", parsed.get("results", []))
                        if not corrections:
                            # Try to find any list value in the dict
                            for v in parsed.values():
                                if isinstance(v, list):
                                    corrections = v
                                    break
                    elif isinstance(parsed, list):
                        corrections = parsed
                    else:
                        logger.warning(f"  ⚠️ Unexpected response format in batch {batch_idx + 1}")
                        corrections = []

                    logger.info(f"  ✅ Batch {batch_idx + 1} returned {len(corrections)} corrections")
                    return corrections

                except json.JSONDecodeError as e:
                    logger.error(f"  ❌ JSON parse error in batch {batch_idx + 1}: {e}")
                    # Return uncorrected entries as fallback
                    return [
                        {
                            "raw_chunk_id": m["raw_chunk_id"],
                            "corrected_text": m["raw_chunk_text"],  # fallback to original
                        }
                        for m in batch
                    ]
                except Exception as e:
                    logger.error(f"  ❌ OpenAI API error in batch {batch_idx + 1}: {e}")
                    return [
                        {
                            "raw_chunk_id": m["raw_chunk_id"],
                            "corrected_text": m["raw_chunk_text"],
                        }
                        for m in batch
                    ]

        # Execute all batches concurrently with semaphore
        tasks = [process_batch(batch, idx) for idx, batch in enumerate(batches)]
        results = await asyncio.gather(*tasks)

        # Flatten all corrections into a single list
        all_corrections = []
        for batch_result in results:
            all_corrections.extend(batch_result)

        # Build a lookup from chunk_id -> corrected_text
        correction_map = {}
        for c in all_corrections:
            cid = c.get("raw_chunk_id")
            if cid is not None:
                correction_map[cid] = c.get("corrected_text", "")

        # Build final corrected chunks with timeline data
        corrected_chunks = []
        for m in all_matches:
            chunk_id = m["raw_chunk_id"]
            corrected_text = correction_map.get(chunk_id)

            corrected_chunks.append({
                "raw_chunk_id": chunk_id,
                "original_raw_text": m["raw_chunk_text"],
                "corrected_text": corrected_text if corrected_text else m["raw_chunk_text"],
                "was_ai_corrected": corrected_text is not None,
                "match_status": m.get("match_status", "unknown"),
                "confidence_score": m.get("confidence_score", 0),
                "audio_start_time_sec": m.get("audio_start_time_sec"),
                "audio_end_time_sec": m.get("audio_end_time_sec"),
                "speakers": m.get("speakers", []),
            })

        # Build human-readable document content
        doc_lines = ["AI-Corrected Proof Document\n", "=" * 40, ""]
        for chunk in corrected_chunks:
            timeline = ""
            if chunk["audio_start_time_sec"] is not None:
                start = chunk["audio_start_time_sec"]
                end = chunk["audio_end_time_sec"] or start
                timeline = f"[{_format_time(start)} - {_format_time(end)}]"

            status = chunk["match_status"]
            confidence = chunk["confidence_score"]
            speakers = ", ".join(chunk["speakers"]) if chunk["speakers"] else "N/A"

            doc_lines.append(f"--- Chunk #{chunk['raw_chunk_id']} {timeline} ---")
            doc_lines.append(f"Status: {status} | Confidence: {confidence}% | Speaker: {speakers}")
            doc_lines.append(chunk["corrected_text"])
            doc_lines.append("")

        full_content = "\n".join(doc_lines)

        context.generated_document = {
            "title": "AI-Corrected Proof Document",
            "content": full_content,
            "version": 1,
            "is_draft": True,
            "corrected_chunks": corrected_chunks,
        }

        context.metadata["document_generation"] = {
            "title": "AI-Corrected Proof Document",
            "total_chunks": len(all_matches),
            "corrected_count": len(correction_map),
            "skipped_count": len(all_matches) - len(correction_map),
            "batches_processed": len(batches),
            "model": settings.OPENAI_MODEL,
        }

        if context.db:
            from sqlalchemy import select
            from app.models.ai_document import AIDocument
            
            result = await context.db.execute(
                select(AIDocument).where(AIDocument.task_id == context.task_id)
            )
            doc = result.scalar_one_or_none()

            if not doc:
                doc = AIDocument(
                    task_id=context.task_id,
                    title="AI-Corrected Proof Document",
                    content=full_content,
                    version=1,
                    is_draft=True,
                    corrected_chunks=corrected_chunks
                )
                context.db.add(doc)
            else:
                doc.content = full_content
                doc.corrected_chunks = corrected_chunks

        logger.info(
            f"✅ Document generation complete: {len(correction_map)} chunks corrected, "
            f"{len(all_matches) - len(correction_map)} skipped"
        )
        return context


def _format_time(seconds: float) -> str:
    """Format seconds into HH:MM:SS format."""
    if seconds is None:
        return "00:00:00"
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"
