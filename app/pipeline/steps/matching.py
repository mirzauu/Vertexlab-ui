"""
Matching pipeline step.
Matches raw PDF chunks to STT audio segments to find chronological alignments.
"""

import logging
import time
import re
from sqlalchemy import select

from app.pipeline.base import BasePipelineStep, PipelineContext
from app.models.transcript import Transcript

logger = logging.getLogger(__name__)

# ─── Helpers ────────────────────────────────────────────────────────────────

def normalize(text: str) -> str:
    t = text.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t

def strip_qa_labels(text: str) -> str:
    t = re.sub(r'\b[QA]\s*[:.]', '', text)
    t = re.sub(r'\bMR\.\s+\w+\s*:', '', t)
    t = re.sub(r'\bMS\.\s+\w+\s*:', '', t)
    t = re.sub(r'[A-Z]\s[A-Z]\s[A-Z](\s[A-Z])+', '', t)
    return t.strip()

# ─── Build Audio Stream ────────────────────────────────────────────────────

def build_audio_stream(segments):
    parts = []
    char_to_seg = []
    seg_info = []

    for i, seg in enumerate(segments):
        # Handle cases where deepgram structure differs
        text = seg.get("text", "")
        start = float(seg.get("start", seg.get("timestamp", 0.0)))
        end = float(seg.get("end", start + 1.0))
        speaker = seg.get("speaker", "Speaker")

        norm = normalize(text)
        seg_info.append({
            "idx": i,
            "start": start,
            "end": end,
            "text": text,
            "norm": norm,
            "speaker": speaker,
        })
        for _ in norm:
            char_to_seg.append(i)
        char_to_seg.append(i)  # space separator
        parts.append(norm)

    full_text = " ".join(parts)
    char_to_seg = char_to_seg[:len(full_text)]
    return full_text, char_to_seg, seg_info

# ─── Search Phrases ────────────────────────────────────────────────────────

def extract_phrases(norm_text: str) -> list[str]:
    words = norm_text.split()
    n = len(words)
    if n <= 2:
        return [norm_text] if len(norm_text) >= 3 else []

    phrases = []

    for length in [60, 50, 40, 30]:
        if len(norm_text) >= length:
            phrases.append(norm_text[:length])
            mid = len(norm_text) // 2 - length // 2
            if mid > 0:
                phrases.append(norm_text[mid:mid + length])
            break

    for wlen in [8, 6, 5, 4]:
        if n >= wlen:
            phrases.append(" ".join(words[:wlen]))
            if n >= wlen + 4:
                mid = n // 2
                phrases.append(" ".join(words[mid:mid + wlen]))
            if n >= wlen + 2:
                phrases.append(" ".join(words[-wlen:]))
            break

    if not phrases and n >= 3:
        phrases.append(" ".join(words[:3]))

    return phrases

def find_all_positions(phrase: str, full_text: str) -> list[int]:
    positions = []
    start = 0
    while True:
        pos = full_text.find(phrase, start)
        if pos < 0:
            break
        positions.append(pos)
        start = pos + 1
    return positions

def find_best_position(phrase: str, full_text: str, expected_pos: int) -> int:
    positions = find_all_positions(phrase, full_text)
    if not positions:
        words = phrase.split()
        for trim in range(1, max(1, len(words) - 2)):
            shorter = " ".join(words[:len(words) - trim])
            if len(shorter) < 10:
                break
            positions = find_all_positions(shorter, full_text)
            if positions:
                break

    if not positions:
        return -1

    forward_positions = [p for p in positions if p >= expected_pos - 500]
    if forward_positions:
        return min(forward_positions, key=lambda p: abs(p - expected_pos) + (500 if p < expected_pos else 0))

    return min(positions, key=lambda p: abs(p - expected_pos))

# ─── Multi-phrase consensus ─────────────────────────────────────────────────

def _consensus_position(phrase_positions: list, expected_pos: int) -> int:
    positions = [p for p, _ in phrase_positions]
    positions.sort()

    best_pos = positions[0]
    best_count = 0

    for anchor in positions:
        count = sum(1 for p in positions if abs(p - anchor) < 500)
        if count > best_count or (count == best_count and abs(anchor - expected_pos) < abs(best_pos - expected_pos)):
            best_count = count
            best_pos = anchor

    return best_pos

def _compute_confidence(raw_norm: str, audio_norm: str) -> float:
    raw_words = set(raw_norm.split())
    audio_words = set(audio_norm.split())

    if not raw_words or not audio_words:
        return 0

    raw_in_audio = len(raw_words & audio_words) / len(raw_words)
    audio_in_raw = len(raw_words & audio_words) / len(audio_words)
    len_ratio = min(len(raw_norm), len(audio_norm)) / max(len(raw_norm), len(audio_norm))

    confidence = (raw_in_audio * 50 + audio_in_raw * 25 + len_ratio * 25)
    return round(min(100, max(0, confidence)), 2)

def _empty_result(chunk_id, raw_text, status):
    return {
        "raw_chunk_id": chunk_id,
        "raw_chunk_text": raw_text,
        "match_status": status,
        "confidence_score": 0,
        "matched_audio_text": None,
        "audio_start_time_sec": None,
        "audio_end_time_sec": None,
        "audio_segment_indices": [],
        "speakers": [],
    }

# ─── Post-processing ───────────────────────────────────────────────────────

def fix_monotonic_order(results):
    timed = [(i, r["audio_start_time_sec"])
             for i, r in enumerate(results) 
             if r["audio_start_time_sec"] is not None and r["match_status"] == "matched"]

    if not timed:
        return results, 0

    lis_indices = set()
    last_t = -1
    for idx, t in timed:
        if t > last_t:
            lis_indices.add(idx)
            last_t = t

    violating_count = len(timed) - len(lis_indices)

    for i, r in enumerate(results):
        if i not in lis_indices:
            if r["match_status"] == "matched":
                r["match_status"] = "reordered"

    for i in range(len(results)):
        r = results[i]
        if i not in lis_indices:
            prev_t, prev_idx = None, -1
            for j in range(i - 1, -1, -1):
                if j in lis_indices and results[j]["audio_start_time_sec"] is not None:
                    prev_t = results[j]["audio_start_time_sec"]
                    prev_idx = j
                    break
            
            next_t, next_idx = None, len(results)
            for j in range(i + 1, len(results)):
                if j in lis_indices and results[j]["audio_start_time_sec"] is not None:
                    next_t = results[j]["audio_start_time_sec"]
                    next_idx = j
                    break

            if prev_t is not None and next_t is not None:
                total_gap = next_idx - prev_idx
                offset = i - prev_idx
                fraction = offset / total_gap if total_gap > 0 else 0.5
                est_t = prev_t + fraction * (next_t - prev_t)
                
                r["audio_start_time_sec"] = round(est_t, 3)
                r["audio_end_time_sec"] = round(est_t + 1.0, 3)
            elif prev_t is not None:
                offset = i - prev_idx
                est_t = prev_t + offset * 3.0
                r["audio_start_time_sec"] = round(est_t, 3)
                r["audio_end_time_sec"] = round(est_t + 1.0, 3)
            elif next_t is not None:
                offset = next_idx - i
                est_t = max(0.0, next_t - offset * 3.0)
                r["audio_start_time_sec"] = round(est_t, 3)
                r["audio_end_time_sec"] = round(est_t + 1.0, 3)
            else:
                est_t = i * 3.0
                r["audio_start_time_sec"] = round(est_t, 3)
                r["audio_end_time_sec"] = round(est_t + 1.0, 3)
            
            if r["match_status"] in ("unmatched", "too_short"):
                r["match_status"] = "interpolated"

    return results, violating_count

# ─── Pipeline Step ─────────────────────────────────────────────────────────

class MatchingStep(BasePipelineStep):
    """Match PDF chunks to STT audio segments."""

    @property
    def name(self) -> str:
        return "matching"

    async def execute(self, context: PipelineContext) -> PipelineContext:
        if not context.db:
            logger.warning("No DB session in context, skipping MatchingStep")
            return context

        result = await context.db.execute(
            select(Transcript).where(Transcript.task_id == context.task_id)
        )
        transcript = result.scalar_one_or_none()

        if not transcript:
            logger.warning("Transcript record not found.")
            return context

        segments = []
        if transcript.content:
            if isinstance(transcript.content, list):
                segments = transcript.content
            elif isinstance(transcript.content, dict):
                segments = transcript.content.get("segments", [])
                
        # If context had newer segments
        if not segments and context.transcript and isinstance(context.transcript, dict) and "segments" in context.transcript:
            segments = context.transcript["segments"]

        raw_data = transcript.chunks

        if not segments or not raw_data:
            logger.warning("Missing segments or chunks. Skipping MatchingStep.")
            return context

        logger.info(f"Matching {len(raw_data)} chunks to {len(segments)} audio segments...")
        
        t0 = time.time()
        full_text, char_to_seg, seg_info = build_audio_stream(segments)
        
        n_text = len(full_text)
        results = []
        total_chunks = len(raw_data)
        chars_per_chunk = n_text / total_chunks if total_chunks else 1
        last_good_pos = 0

        for ci, chunk in enumerate(raw_data):
            # Normalization
            raw_text = chunk.get("combined") or chunk.get("text", "")
            chunk_id = chunk.get("id", ci)
            qa_text = strip_qa_labels(raw_text)
            norm = normalize(qa_text)

            if len(norm) < 3:
                results.append(_empty_result(chunk_id, raw_text, "too_short"))
                continue

            linear_estimate = int(ci * chars_per_chunk)
            expected_pos = max(last_good_pos, linear_estimate)

            phrases = extract_phrases(norm)
            phrase_positions = []
            for phrase in phrases:
                pos = find_best_position(phrase, full_text, expected_pos)
                if pos >= 0:
                    phrase_positions.append((pos, phrase))

            if not phrase_positions:
                results.append(_empty_result(chunk_id, raw_text, "unmatched"))
                continue

            if len(phrase_positions) >= 2:
                best_pos = _consensus_position(phrase_positions, expected_pos)
            else:
                best_pos = phrase_positions[0][0]

            seg_start = char_to_seg[min(best_pos, len(char_to_seg) - 1)]
            end_char = min(best_pos + len(norm), n_text - 1)
            seg_end = char_to_seg[min(end_char, len(char_to_seg) - 1)]

            seg_range = list(range(seg_start, seg_end + 1))
            matched_audio = " ".join(seg_info[s]["text"] for s in seg_range)
            start_time = seg_info[seg_start]["start"]
            end_time = seg_info[seg_end]["end"]
            speakers = list(dict.fromkeys(seg_info[s]["speaker"] for s in seg_range))

            confidence = _compute_confidence(norm, normalize(matched_audio))

            if confidence >= 55:
                status = "matched"
            elif confidence >= 30:
                status = "partial"
            else:
                status = "low_confidence"

            results.append({
                "raw_chunk_id": chunk_id,
                "raw_chunk_text": raw_text,
                "match_status": status,
                "confidence_score": confidence,
                "matched_audio_text": matched_audio,
                "audio_start_time_sec": round(start_time, 3),
                "audio_end_time_sec": round(end_time, 3),
                "audio_segment_indices": seg_range,
                "speakers": speakers,
            })

            if confidence >= 40:
                last_good_pos = max(last_good_pos, best_pos)

        results, mono_violations = fix_monotonic_order(results)
        
        elapsed = time.time() - t0

        status_counts = {}
        for r in results:
            s = r["match_status"]
            status_counts[s] = status_counts.get(s, 0) + 1

        conf_list = [r["confidence_score"] for r in results if r["confidence_score"] > 0]
        avg_conf = sum(conf_list) / len(conf_list) if conf_list else 0

        good = sum(
            1 for r in results
            if r["match_status"] == "matched" and r["matched_audio_text"]
            and len(r["matched_audio_text"].split()) >= max(3, len(r["raw_chunk_text"].split()) * 0.3)
        )

        summary = {
            "total_raw_chunks": len(raw_data),
            "total_audio_segments": len(segments),
            "status_breakdown": status_counts,
            "average_confidence": round(avg_conf, 2),
            "quality_matches": good,
            "monotonic_violations": mono_violations,
            "processing_time_sec": round(elapsed, 1),
            "matches": results,
        }
        
        # Save matches back to DB
        transcript.matches = results
        
        context.matching_result = summary
        context.metadata["matching"] = summary

        logger.info(f"Matching completed in {elapsed:.1f}s. {good} quality matches found.")
        return context
