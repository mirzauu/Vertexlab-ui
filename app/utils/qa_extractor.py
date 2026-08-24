"""
Geometry-First, Label-Anchor Q&A Extraction Engine.

Supports two PDF layout modes (auto-detected):

  MODE A — Isolated Label Column (original raw transcripts):
    Q. and A. appear as standalone tiny marker spans at a fixed X-column (e.g. x=172.8).
    Body text for the same line appears at a separate X offset (e.g. x=230.4).
    Continuation lines appear at yet another X (e.g. x=134.6).
    Detection: calibrate label_col_x from first 8 pages by finding spans whose full text
    is exactly 'Q.' or 'A.'; anchor rows are those containing an item at that column.

  MODE B — Line-Prefix Embedded (AI-corrected transcripts):
    Q. and A. are embedded at the very START of a single combined text span, e.g.:
      'Q. Good afternoon Mr. Sakhai. Can you hear me?'
      'A. Yes.'
    No isolated anchor span exists. Continuation lines have the same X as all other lines.
    Detection: no anchors found in Pass 1 calibration → fall back to line-prefix regex.

In BOTH modes, a block only closes when a new anchor is detected.
Every non-anchor line is appended as continuation to the current open block.
"""

import re
import logging
from dataclasses import dataclass, asdict
from typing import Union, Optional
import fitz  # PyMuPDF

logger = logging.getLogger(__name__)

# Exact anchor label patterns — must be standalone on the span, very short
_ANCHOR_RE = re.compile(r'^Q[\.:]?$|^A[\.:]?$', re.IGNORECASE)

# Line-prefix pattern: Q. / A. embedded at the very start of the merged line text
# Captures group(1)=type letter, group(2)=body text after the prefix
_LINE_PREFIX_RE = re.compile(
    r'^(Q|A)[\.:][\s\u00b7]+(.*)$',
    re.IGNORECASE | re.DOTALL
)

# Inline Q ... A pattern: 'Q. <question text> A: <answer text>' on a single line
_INLINE_QA_RE = re.compile(
    r'^Q[\.:][\s\u00b7]+(.+?)\s+A[\.:][\s\u00b7]+(.+)$',
    re.IGNORECASE | re.DOTALL
)

# Colloquy speaker pattern — all-caps name followed by colon
_SPEAKER_RE = re.compile(
    r'^((?:(?:BY\s+)?(?:MR\.|MS\.|MRS\.|DR\.)\s+[A-Z][A-Z\s\.\'\-]+|'
    r'THE\s+(?:COURT|WITNESS|REPORTER|CLERK|VIDEOGRAPHER|INTERPRETER)|'
    r'DIRECT\s+EXAMINATION|CROSS\s+EXAMINATION|REDIRECT|RECROSS|'
    r'EXAMINATION)\s*:)\s*(.*)$',
    re.IGNORECASE | re.DOTALL
)

OBJECTION_KEYWORDS = frozenset([
    "objection", "move to strike", "instruct the witness",
    "asked and answered", "speculation", "leading", "hearsay",
    "compound", "vague", "argumentative", "foundation"
])

JUNK_TERMS_DEFAULT = [
    "Veritext", "WWW.VERITEXT.COM", "800-567-8568",
    "973-410-4040", "Veritext Legal Solutions"
]


@dataclass
class SpeechBlock:
    block_id: int
    page: int
    line_numbers: list
    block_type: str   # "Q" | "A" | "COLLOQUY" | "OBJECTION" | "HEADER"
    speaker: str
    text: str
    bbox: list

    def to_dict(self) -> dict:
        return asdict(self)


def _is_objection(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in OBJECTION_KEYWORDS)


# ---------------------------------------------------------------------------
# Pass 1 helpers — calibrate label-column X position from sample pages
# ---------------------------------------------------------------------------

def _calibrate_label_column(doc: fitz.Document) -> Optional[float]:
    """
    Sample the first 8 pages (or as many as exist) to find the median X-position
    of standalone Q. / A. label spans. Returns None if no anchors found (fallback mode).
    """
    anchor_xs = []
    sample_count = min(8, len(doc))
    for pg_idx in range(sample_count):
        page = doc[pg_idx]
        for b in page.get_text("dict").get("blocks", []):
            if "lines" not in b:
                continue
            for l in b["lines"]:
                # Only look at spans where the full concatenated text is Q. or A.
                full = "".join(s.get("text", "") for s in l.get("spans", [])).strip()
                if _ANCHOR_RE.match(full):
                    anchor_xs.append(float(l["bbox"][0]))

    if not anchor_xs:
        return None

    anchor_xs.sort()
    median_x = anchor_xs[len(anchor_xs) // 2]
    logger.info(f"Label column calibrated at x={median_x:.1f}pt from {len(anchor_xs)} anchors")
    return median_x


# ---------------------------------------------------------------------------
# Pass 2 — per-page row assembly (cluster spans on the same visual baseline)
# ---------------------------------------------------------------------------

def _build_page_rows(page: fitz.Page, line_height: float) -> list:
    """
    Collect all text items on the page, then cluster items that share the same
    visual baseline (within line_height * 0.45) into a single "row".
    Each row is sorted left-to-right and carries a list of original items.
    Returns list of row dicts: {y0, x0, items, merged_text, bbox}.
    """
    row_threshold = max(7.0, line_height * 0.45)

    raw = []
    for b in page.get_text("dict").get("blocks", []):
        if "lines" not in b:
            continue
        for l in b["lines"]:
            spans = l.get("spans", [])
            text = "".join(s.get("text", "") for s in spans).strip()
            if not text:
                continue
            bbox = l.get("bbox", (0, 0, 0, 0))
            raw.append({
                "text": text,
                "bbox": list(bbox),
                "x0": float(bbox[0]),
                "y0": float(bbox[1]),
                "x1": float(bbox[2]),
                "y1": float(bbox[3])
            })

    # Cluster into rows
    rows: list = []
    for item in sorted(raw, key=lambda x: x["y0"]):
        placed = False
        for row in rows:
            if abs(row["y0"] - item["y0"]) <= row_threshold:
                row["items"].append(item)
                placed = True
                break
        if not placed:
            rows.append({"y0": item["y0"], "items": [item]})

    # Finalise each row
    result = []
    for row in rows:
        items = sorted(row["items"], key=lambda x: x["x0"])
        merged_text = "  ".join(i["text"] for i in items)
        bbox = [
            min(i["bbox"][0] for i in items),
            min(i["bbox"][1] for i in items),
            max(i["bbox"][2] for i in items),
            max(i["bbox"][3] for i in items),
        ]
        result.append({
            "y0": row["y0"],
            "x0": items[0]["x0"],
            "items": items,
            "merged_text": merged_text,
            "bbox": bbox
        })

    return result


# ---------------------------------------------------------------------------
# Noise filter helpers
# ---------------------------------------------------------------------------

def _build_junk_filters(structure_rules: dict, page_height: float):
    junk_terms = structure_rules.get("junk_terms", JUNK_TERMS_DEFAULT)
    page_patterns = [
        re.compile(p, re.IGNORECASE)
        for p in structure_rules.get("page_number_regexes", [r'(?i)^page \d+$'])
    ]
    return junk_terms, page_patterns


def _is_noise(text: str, x0: float, y0: float, page_height: float,
              junk_terms: list, page_patterns: list,
              line_num_x: float, line_num_width: float, max_line_num: int) -> bool:
    # Side line numbers
    if text.isdigit() and x0 <= (line_num_x + line_num_width + 15.0):
        n = int(text)
        if 1 <= n <= (max_line_num + 5):
            return True

    # Junk terms
    if any(j.lower() in text.lower() for j in junk_terms):
        return True

    # Bare phone numbers
    if re.search(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', text) and len(text) < 25:
        return True

    # Page number indicators (header / footer zone)
    if any(p.search(text) for p in page_patterns):
        return True
    if (re.match(r'^(?:page\s+)?\d+(?:\s+of\s+\d+)?$', text, re.IGNORECASE)
            and (y0 < page_height * 0.1 or y0 > page_height * 0.9)):
        return True

    return False


# ---------------------------------------------------------------------------
# Line-number lookup
# ---------------------------------------------------------------------------

def _build_line_num_map(rows: list, line_num_x: float,
                        line_num_width: float, max_line_num: int) -> dict:
    """Map of quantised y-key → page line number for this page's rows."""
    lnmap = {}
    for row in rows:
        for item in row["items"]:
            t = item["text"].strip()
            if t.isdigit() and item["x0"] <= (line_num_x + line_num_width + 15.0):
                n = int(t)
                if 1 <= n <= (max_line_num + 5):
                    key = round(item["y0"] / 8.0) * 8
                    lnmap[key] = n
    return lnmap


def _lookup_line_num(y0: float, lnmap: dict) -> Optional[int]:
    key = round(y0 / 8.0) * 8
    if key in lnmap:
        return lnmap[key]
    for offset in (-8, 8, -16, 16, -24, 24):
        if (key + offset) in lnmap:
            return lnmap[key + offset]
    return None


# ---------------------------------------------------------------------------
# Pass 3 — Anchor-guided sequential collection (main logic)
# ---------------------------------------------------------------------------

def _row_is_anchor(
    row: dict,
    label_col_x: Optional[float],
    tol: float = 30.0
) -> Optional[str]:
    """
    MODE A (label_col_x is set): Return 'Q' or 'A' if an item in this row
      is an isolated Q./A. label at the calibrated label column.
    MODE B (label_col_x is None): Return 'Q' or 'A' if the merged row text
      STARTS with 'Q.' or 'A.' as a line prefix.
    Returns None if this row is not an anchor.
    """
    if label_col_x is not None:
        # MODE A — isolated label span at calibrated column
        for item in row["items"]:
            t = item["text"].strip()
            if _ANCHOR_RE.match(t) and abs(item["x0"] - label_col_x) <= tol:
                return t[0].upper()
    else:
        # MODE B — Q./A. embedded as line prefix
        m = _LINE_PREFIX_RE.match(row["merged_text"])
        if m:
            return m.group(1).upper()
    return None


def _row_body_text(
    row: dict,
    label_col_x: Optional[float],
    tol: float = 30.0
) -> str:
    """
    MODE A: Strip the isolated anchor item from the row; return remaining text.
    MODE B: Strip the 'Q. ' / 'A. ' prefix from the beginning of merged_text.
    """
    if label_col_x is not None:
        # MODE A — exclude the anchor span item
        parts = []
        for item in row["items"]:
            t = item["text"].strip()
            if _ANCHOR_RE.match(t) and abs(item["x0"] - label_col_x) <= tol:
                continue
            parts.append(t)
        return "  ".join(parts).strip()
    else:
        # MODE B — strip leading 'Q. ' / 'A. ' prefix
        m = _LINE_PREFIX_RE.match(row["merged_text"])
        if m:
            return m.group(2).strip()
        return row["merged_text"].strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_speech_blocks_from_pdf(
    pdf_source: Union[str, bytes],
    layout_profile: Optional[dict] = None,
    structure_rules: Optional[dict] = None
) -> tuple[list, str]:
    """
    Geometry-first extraction of ordered SpeechBlocks from a legal transcript PDF.

    Returns (speech_blocks, cleaned_full_text).
    speech_blocks is a flat ordered list — no pairing or grouping.
    """
    if structure_rules is None:
        structure_rules = {}

    # Load layout metrics
    if layout_profile is None:
        from app.utils.pdf_layout import extract_pdf_layout_profile
        layout_profile = extract_pdf_layout_profile(pdf_source)

    line_num_x = float(layout_profile.get("line_number_x", 80.0))
    line_num_width = float(layout_profile.get("line_number_width", 25.0))
    line_height = float(layout_profile.get("line_height", 24.0))
    max_line_num = int(layout_profile.get("max_lines_per_page", 25))

    # Open PDF
    if isinstance(pdf_source, bytes):
        doc = fitz.open(stream=pdf_source, filetype="pdf")
    elif isinstance(pdf_source, str) and (
            pdf_source.startswith("http://") or pdf_source.startswith("https://")):
        import httpx
        resp = httpx.get(pdf_source, timeout=60.0)
        resp.raise_for_status()
        doc = fitz.open(stream=resp.content, filetype="pdf")
    else:
        doc = fitz.open(pdf_source)

    # Pass 1 — calibrate label column
    label_col_x = _calibrate_label_column(doc)
    label_tol = 35.0   # points tolerance around the label column

    speech_blocks: list[SpeechBlock] = []
    cleaned_lines: list[str] = []
    current: Optional[SpeechBlock] = None
    block_id = 1

    for pg_idx in range(len(doc)):
        page = doc[pg_idx]
        page_height = float(page.rect.height)

        junk_terms, page_patterns = _build_junk_filters(structure_rules, page_height)

        # Pass 2 — build visual rows
        all_rows = _build_page_rows(page, line_height)
        lnmap = _build_line_num_map(all_rows, line_num_x, line_num_width, max_line_num)

        # Filter noise rows (whole row is noise if ALL items are noise)
        clean_rows = []
        for row in all_rows:
            kept_items = [
                item for item in row["items"]
                if not _is_noise(
                    item["text"], item["x0"], item["y0"], page_height,
                    junk_terms, page_patterns,
                    line_num_x, line_num_width, max_line_num
                )
            ]
            if kept_items:
                # Rebuild merged_text from kept items
                row["items"] = sorted(kept_items, key=lambda x: x["x0"])
                row["merged_text"] = "  ".join(i["text"] for i in row["items"])
                row["x0"] = row["items"][0]["x0"]
                clean_rows.append(row)

        # Pass 3 — anchor-guided sequential collection
        for row in clean_rows:
            line_num = _lookup_line_num(row["y0"], lnmap)
            line_nums = [line_num] if line_num else []

            # --- Check for inline Q...A on the same line (MODE B only) ---
            if label_col_x is None:
                inline_m = _INLINE_QA_RE.match(row["merged_text"])
                if inline_m:
                    # Save current block, emit a Q then an A
                    if current is not None:
                        speech_blocks.append(current)
                    q_text = inline_m.group(1).strip()
                    a_text = inline_m.group(2).strip()
                    speech_blocks.append(SpeechBlock(
                        block_id=block_id, page=pg_idx + 1, line_numbers=line_nums,
                        block_type="Q", speaker="Q.", text=q_text, bbox=list(row["bbox"])
                    ))
                    block_id += 1
                    speech_blocks.append(SpeechBlock(
                        block_id=block_id, page=pg_idx + 1, line_numbers=line_nums,
                        block_type="A", speaker="A.", text=a_text, bbox=list(row["bbox"])
                    ))
                    block_id += 1
                    current = None
                    cleaned_lines.append(f"Q. {q_text}")
                    cleaned_lines.append(f"A. {a_text}")
                    continue

            anchor_type = _row_is_anchor(row, label_col_x, label_tol)
            body_text = _row_body_text(row, label_col_x, label_tol)

            if anchor_type:
                # --- New Q or A anchor found — close previous block ---
                if current is not None:
                    speech_blocks.append(current)

                current = SpeechBlock(
                    block_id=block_id,
                    page=pg_idx + 1,
                    line_numbers=line_nums,
                    block_type=anchor_type,
                    speaker=f"{anchor_type}.",
                    text=body_text,
                    bbox=list(row["bbox"])
                )
                block_id += 1

                if body_text:
                    cleaned_lines.append(f"{anchor_type}. {body_text}")
                else:
                    cleaned_lines.append(f"{anchor_type}.")

            else:
                # --- No anchor — check if it's speaker colloquy or continuation ---
                spk_match = _SPEAKER_RE.match(row["merged_text"])

                if spk_match:
                    # Speaker / attorney colloquy line — starts a new block
                    if current is not None:
                        speech_blocks.append(current)

                    spk_header = spk_match.group(1).rstrip(":").strip()
                    spk_body = spk_match.group(2).strip()
                    b_type = "OBJECTION" if _is_objection(spk_body or row["merged_text"]) else "COLLOQUY"

                    current = SpeechBlock(
                        block_id=block_id,
                        page=pg_idx + 1,
                        line_numbers=line_nums,
                        block_type=b_type,
                        speaker=spk_header,
                        text=spk_body,
                        bbox=list(row["bbox"])
                    )
                    block_id += 1
                    cleaned_lines.append(
                        f"{spk_header}: {spk_body}" if spk_body else f"{spk_header}:"
                    )

                else:
                    # Pure continuation line — always append to current block
                    cont_text = row["merged_text"]
                    if current is not None:
                        if current.text:
                            current.text += " " + cont_text
                        else:
                            current.text = cont_text
                        if line_nums:
                            current.line_numbers.extend(line_nums)
                        # Expand bbox to cover continuation
                        current.bbox[2] = max(current.bbox[2], row["bbox"][2])
                        current.bbox[3] = max(current.bbox[3], row["bbox"][3])
                    else:
                        # Pre-examination header / preamble text
                        current = SpeechBlock(
                            block_id=block_id,
                            page=pg_idx + 1,
                            line_numbers=line_nums,
                            block_type="HEADER",
                            speaker="",
                            text=cont_text,
                            bbox=list(row["bbox"])
                        )
                        block_id += 1

                    cleaned_lines.append(cont_text)

    if current is not None:
        speech_blocks.append(current)

    doc.close()
    return speech_blocks, "\n".join(cleaned_lines)


# ---------------------------------------------------------------------------
# Aggregator — pairs ordered blocks into Q&A dicts (optional downstream step)
# ---------------------------------------------------------------------------

def aggregate_speech_blocks_to_qa(speech_blocks: list) -> list:
    """
    Pairs the flat ordered SpeechBlock list into structured Q&A dicts for
    Transcript.chunks storage. A block only closes when a new Q anchor is found.
    """
    qa_pairs = []
    current_q: Optional[SpeechBlock] = None
    interim_objections: list[str] = []
    pair_id = 1

    for block in speech_blocks:
        btype = block.block_type

        if btype == "Q":
            if current_q is not None:
                # Save previous unanswered question
                obj_str = " ".join(interim_objections) or None
                combined = f"Q: {current_q.text} A: [No Answer Recorded]"
                if obj_str:
                    combined += f" (Objection: {obj_str})"
                qa_pairs.append(_make_pair(pair_id, current_q, "", obj_str, combined))
                pair_id += 1
            current_q = block
            interim_objections = []

        elif btype == "A":
            if current_q is not None:
                obj_str = " ".join(interim_objections) or None
                combined = f"Q: {current_q.text} A: {block.text}"
                if obj_str:
                    combined += f" (Objection: {obj_str})"
                all_lines = (current_q.line_numbers or []) + (block.line_numbers or [])
                qa_pairs.append(_make_pair(pair_id, current_q, block.text, obj_str, combined, all_lines))
                pair_id += 1
                current_q = None
                interim_objections = []

        elif btype in ("OBJECTION", "COLLOQUY"):
            label = f"{block.speaker}: {block.text}" if block.text else block.speaker
            if current_q is not None:
                interim_objections.append(label)
            elif btype == "OBJECTION" and qa_pairs:
                last = qa_pairs[-1]
                last["objection"] = (last["objection"] + " " + label).strip() if last["objection"] else label
                if "(Objection:" in last["combined"]:
                    last["combined"] += " " + label
                else:
                    last["combined"] += f" (Objection: {label})"

    if current_q is not None:
        obj_str = " ".join(interim_objections) or None
        combined = f"Q: {current_q.text} A: [No Answer Recorded]"
        if obj_str:
            combined += f" (Objection: {obj_str})"
        qa_pairs.append(_make_pair(pair_id, current_q, "", obj_str, combined))

    return qa_pairs


def _make_pair(pid, q_block, a_text, obj_str, combined, all_lines=None):
    lines = all_lines or (q_block.line_numbers or [])
    return {
        "id": pid,
        "question": q_block.text,
        "answer": a_text,
        "objection": obj_str,
        "combined": combined,
        "page": q_block.page,
        "line_start": min(lines) if lines else 1,
        "line_end": max(lines) if lines else 1,
        "speaker": q_block.speaker
    }
