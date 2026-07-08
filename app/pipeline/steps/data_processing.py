"""
Data processing pipeline step.
"""

import re
import fitz  # PyMuPDF
import logging
from sqlalchemy import select
from app.pipeline.base import BasePipelineStep, PipelineContext
from app.models.transcript import Transcript

logger = logging.getLogger(__name__)


def clean_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r' +', ' ', text)
    return text.strip()


def extract_qa(text: str, structure_rules: dict = None) -> list[dict]:
    if not text:
        return []
        
    if structure_rules is None:
        structure_rules = {}

    # Split final_output into blocks
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]

    # Regex to identify block type and strip prefixes
    q_pat = structure_rules.get("q_pattern_regex", r"^Q\.\s*")
    a_pat = structure_rules.get("a_pattern_regex", r"^A\.\s*")
    spk_pat = structure_rules.get("speaker_pattern_regex", r"^([A-Z][A-Z\s\(\)\.]+:)\s*")
    
    try:
        q_pattern = re.compile(q_pat, re.IGNORECASE)
        a_pattern = re.compile(a_pat, re.IGNORECASE)
        speaker_pattern = re.compile(spk_pat, re.IGNORECASE)
    except re.error as e:
        logger.warning(f"Invalid regex in structure_rules: {e}. Using fallbacks.")
        q_pattern = re.compile(r'^Q\.\s*', re.IGNORECASE)
        a_pattern = re.compile(r'^A\.\s*', re.IGNORECASE)
        speaker_pattern = re.compile(r'^([A-Z][A-Z\s\(\)\.]+:)\s*')

    inline_pattern = re.compile(r'^Q\.\s+(.*?)\s+A[.:]\s+(.*)$', re.IGNORECASE | re.DOTALL)

    qa_pairs = []
    current_q = None
    current_objections = []
    
    first_q_found = False

    for block in blocks:
        # 1. Check if the block is an inline Q&A
        inline_match = inline_pattern.match(block)
        if inline_match:
            q_text = inline_match.group(1).strip()
            a_text = inline_match.group(2).strip()
            
            # Extract parenthesized objections from answer if present
            objection_text = None
            obj_match = re.search(r'\s*\(Objection:\s*(.*?)\)\s*$', a_text, re.IGNORECASE)
            if obj_match:
                objection_text = obj_match.group(1).strip()
                a_text = re.sub(r'\s*\(Objection:\s*(.*?)\)\s*$', '', a_text, flags=re.IGNORECASE).strip()
                
            combined_field = f"Q: {q_text} A: {a_text}"
            if objection_text:
                combined_field += f" (Objection: {objection_text})"
                
            qa_pairs.append({
                "id": len(qa_pairs) + 1,
                "question": q_text,
                "answer": a_text,
                "objection": objection_text,
                "combined": combined_field
            })
            continue

        # 2. Otherwise parse multi-block Q&A sequence
        if q_pattern.match(block):
            first_q_found = True
            current_q = q_pattern.sub("", block).strip()
            current_objections = []
        
        elif a_pattern.match(block):
            if first_q_found and current_q is not None:
                current_a = a_pattern.sub("", block).strip()
                
                # Format the objection if any were captured between Q and A
                objection_text = None
                if current_objections:
                    objection_text = " ".join(current_objections)
                
                # Construct question text
                q_text = current_q
                
                # Format combined field based on user's specifications
                if objection_text:
                    combined_field = f"Q: {q_text} A: {current_a} (Objection: {objection_text})"
                else:
                    combined_field = f"Q: {q_text} A: {current_a}"
                
                qa_pairs.append({
                    "id": len(qa_pairs) + 1,
                    "question": q_text,
                    "answer": current_a,
                    "objection": objection_text,
                    "combined": combined_field
                })
                
                # Reset for next Q&A
                current_q = None
                current_objections = []
        
        elif speaker_pattern.match(block):
            if first_q_found and current_q is not None:
                # Attorney comments occurring between Q and A -> keep as objection
                current_objections.append(block)
            else:
                # Attorney comments occurring after A but before next Q -> discard!
                pass
                
        else:
            if first_q_found and current_q is not None:
                current_q += " " + block
            else:
                pass

    return qa_pairs


async def detect_pdf_structure(sample_text: str) -> dict:
    """
    Use OpenAI to analyze the first few pages of a transcript
    to detect recurring headers/footers, line numbering patterns, etc.
    """
    from openai import AsyncOpenAI
    from app.config import settings
    import json

    fallback_rules = {
        "junk_terms": [
            "Veritext",
            "WWW.VERITEXT.COM",
            "800-567-8568",
            "973-410-4040",
            "Veritext Legal Solutions"
        ],
        "line_number_range": [1, 25],
        "page_number_regexes": [r'(?i)^page \d+$'],
        "q_pattern_regex": r"^Q\.\s*",
        "a_pattern_regex": r"^A\.\s*",
        "speaker_pattern_regex": r"^([A-Z][A-Z\s\(\)\.]+:)\s*"
    }

    if not settings.OPENAI_API_KEY:
        logger.warning("OPENAI_API_KEY is not set. Using static fallback rules.")
        return fallback_rules

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    system_prompt = r"""You are an expert at analyzing legal transcript formats and OCR/PDF structure.
You will be provided with a raw text sample from the first few pages of a transcript.
Identify recurring layout elements that do not belong to the spoken testimony, as well as the structures for Questions, Answers, and Speakers.
Specifically, identify:
1. Recurring header or footer terms (such as court reporting agency names, websites, phone numbers, email addresses, or common office labels like "Veritext").
2. The range of line numbers listed down the side of pages (usually 1-25, but can be 1-28, etc., or null if none).
3. The format of the page number indicator (e.g. "Page 1", "Page 1 of 100", "- 1 -", etc.).
4. The regex pattern that identifies the start of a Question. For example, if questions appear as "Q." or "MS. LLOYD: Q.", output a regex like "^(?:[A-Z\s\.]+:\s*)?Q\.\s*". You MUST ensure the pattern requires the trailing period (e.g. Q\.) so it does not match regular words starting with Q.
5. The regex pattern that identifies the start of an Answer. For example, "^(?:[A-Z\s\.]+:\s*)?A\.\s*". You MUST ensure the pattern requires the trailing period (e.g. A\.) so it does not match regular words starting with A.
6. The regex pattern that identifies the start of a Speaker's statement. For example, "^([A-Z][A-Z\s\(\)\.]+:)\s*"

Return ONLY a valid JSON object matching the following schema:
{
  "junk_terms": ["list", "of", "detected", "junk", "terms", "to", "filter"],
  "line_number_range": [start_int, end_int],  // e.g. [1, 25], or null if none
  "page_number_regexes": ["list of python-compatible regex patterns matching page indicators (case insensitive)"],
  "q_pattern_regex": "python regex string",
  "a_pattern_regex": "python regex string",
  "speaker_pattern_regex": "python regex string"
}

Example output:
{
  "junk_terms": ["Veritext", "WWW.VERITEXT.COM", "800-567-8568", "Veritext Legal Solutions"],
  "line_number_range": [1, 25],
  "page_number_regexes": ["^page \\d+$"],
  "q_pattern_regex": "^(?:[A-Z\\s\\.]+:\\s*)?Q\\.\\s*",
  "a_pattern_regex": "^(?:[A-Z\\s\\.]+:\\s*)?A\\.\\s*",
  "speaker_pattern_regex": "^([A-Z][A-Z\\s\\(\\)\\.]+:\\s*)"
}

No extra commentary, no markdown fences, ONLY the JSON object. Do not include markdown code block syntax (like ```json ... ```)."""

    try:
        logger.info("Sending transcript sample to OpenAI for layout analysis...")
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Sample text:\n\n{sample_text[:8000]}"},
            ],
            response_format={"type": "json_object"},
            timeout=30.0
        )
        raw_response = response.choices[0].message.content.strip()
        parsed = json.loads(raw_response)

        # Validate parsed result keys and types
        cleaned_rules = {}
        cleaned_rules["junk_terms"] = [str(term) for term in parsed.get("junk_terms", []) if term]

        line_range = parsed.get("line_number_range")
        if isinstance(line_range, list) and len(line_range) == 2 and all(isinstance(x, int) for x in line_range):
            cleaned_rules["line_number_range"] = line_range
        else:
            cleaned_rules["line_number_range"] = fallback_rules["line_number_range"]

        cleaned_rules["page_number_regexes"] = [str(pat) for pat in parsed.get("page_number_regexes", []) if pat]

        # Get regexes or use fallback
        cleaned_rules["q_pattern_regex"] = str(parsed.get("q_pattern_regex", fallback_rules["q_pattern_regex"]))
        cleaned_rules["a_pattern_regex"] = str(parsed.get("a_pattern_regex", fallback_rules["a_pattern_regex"]))
        cleaned_rules["speaker_pattern_regex"] = str(parsed.get("speaker_pattern_regex", fallback_rules["speaker_pattern_regex"]))

        # If any of those are empty/missing, supply defaults
        if not cleaned_rules["junk_terms"]:
            cleaned_rules["junk_terms"] = fallback_rules["junk_terms"]
        if not cleaned_rules["page_number_regexes"]:
            cleaned_rules["page_number_regexes"] = fallback_rules["page_number_regexes"]
        if not cleaned_rules["q_pattern_regex"]:
            cleaned_rules["q_pattern_regex"] = fallback_rules["q_pattern_regex"]
        if not cleaned_rules["a_pattern_regex"]:
            cleaned_rules["a_pattern_regex"] = fallback_rules["a_pattern_regex"]
        if not cleaned_rules["speaker_pattern_regex"]:
            cleaned_rules["speaker_pattern_regex"] = fallback_rules["speaker_pattern_regex"]

        logger.info(f"OpenAI successfully detected PDF structure: {cleaned_rules}")
        return cleaned_rules

    except Exception as e:
        logger.error(f"Error during dynamic PDF structure detection: {e}. Falling back to static rules.")
        return fallback_rules


def clean_transcript_pdf(input_path: str, structure_rules: dict = None) -> str:
    if structure_rules is None:
        structure_rules = {
            "junk_terms": [
                "Veritext",
                "WWW.VERITEXT.COM",
                "800-567-8568",
                "973-410-4040",
                "Veritext Legal Solutions"
            ],
            "line_number_range": [1, 25],
            "page_number_regexes": [r'(?i)^page \d+$']
        }

    doc = fitz.open(input_path)
    all_lines = []

    # Compile page number regexes
    page_patterns = []
    for pat in structure_rules.get("page_number_regexes", []):
        try:
            page_patterns.append(re.compile(pat, re.IGNORECASE))
        except re.error as e:
            logger.warning(f"Invalid regex pattern from structure detection '{pat}': {e}")

    line_range = structure_rules.get("line_number_range")
    min_line_num, max_line_num = None, None
    if isinstance(line_range, list) and len(line_range) == 2:
        min_line_num, max_line_num = line_range[0], line_range[1]

    junk_terms = structure_rules.get("junk_terms", [])

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text")
        lines = text.split('\n')

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # 1. Clean line numbers down the side
            if min_line_num is not None and max_line_num is not None:
                if re.match(r'^\d+$', stripped):
                    n = int(stripped)
                    if min_line_num <= n <= max_line_num:
                        continue

            # 2. Clean junk terms
            if any(term.lower() in stripped.lower() for term in junk_terms):
                continue

            # 3. Clean general phone numbers
            if re.search(r'\d{3}-\d{3}-\d{4}', stripped):
                if len(stripped) < 20:
                    continue
                else:
                    stripped = re.sub(r'\d{3}-\d{3}-\d{4}', '', stripped).strip()

            # 4. Clean page indicators
            matched_page = False
            for pat in page_patterns:
                if pat.search(stripped):
                    matched_page = True
                    break
            if matched_page:
                continue

            stripped = re.sub(r'^\d{1,2}\s+', '', stripped)
            stripped = re.sub(r'\s+\d{1,2}$', '', stripped)

            if stripped:
                all_lines.append(stripped)

    q_pat = structure_rules.get("q_pattern_regex", r"^Q\.\s*")
    a_pat = structure_rules.get("a_pattern_regex", r"^A\.\s*")
    spk_pat = structure_rules.get("speaker_pattern_regex", r"^([A-Z][A-Z\s\(\)\.]+:)\s*")
    
    try:
        combined_pattern = f"(?:{q_pat})|(?:{a_pat})|(?:{spk_pat})"
        speaker_pattern = re.compile(combined_pattern, re.IGNORECASE)
    except re.error as e:
        logger.warning(f"Invalid dynamic regex for block splitting: {e}. Falling back to default.")
        speaker_pattern = re.compile(r'^([QA]\.|[A-Z][A-Z\s\(\)\.]+:)\s*', re.IGNORECASE)

    blocks = []
    current_block = ""

    for line in all_lines:
        if speaker_pattern.match(line):
            if current_block:
                blocks.append(current_block.strip())
            current_block = line + " "
        else:
            if current_block:
                current_block += line + " "
            else:
                current_block = line + " "

    if current_block:
        blocks.append(current_block.strip())

    final_output = "\n\n".join(blocks)
    final_output = re.sub(r' +', ' ', final_output)

    return final_output


class DataProcessingStep(BasePipelineStep):
    """Extract and clean raw data from uploaded files."""

    @property
    def name(self) -> str:
        return "data_processing"

    async def execute(self, context: PipelineContext) -> PipelineContext:
        if not context.raw_data_file_paths:
            logger.warning("No raw data file paths provided.")
            return context

        import os
        from app.config import settings

        pdf_path = context.raw_data_file_paths[0]
        full_pdf_path = os.path.abspath(os.path.join(settings.STORAGE_PATH, pdf_path))
        logger.info(f"Processing PDF: {full_pdf_path}")

        try:
            # 1. Extract raw text for structure analysis
            import fitz
            doc = fitz.open(full_pdf_path)
            sample_text_parts = []
            
            # First 3 pages for preamble/headers
            for i in range(min(3, len(doc))):
                page = doc.load_page(i)
                sample_text_parts.append(f"--- PAGE {i+1} ---\n" + page.get_text("text"))
                
            # Middle 3 pages for QA structure
            mid_start = max(3, len(doc) // 2)
            for i in range(mid_start, min(mid_start + 3, len(doc))):
                page = doc.load_page(i)
                sample_text_parts.append(f"--- PAGE {i+1} ---\n" + page.get_text("text"))
                
            sample_text = "\n".join(sample_text_parts)
            doc.close()

            # 2. Detect layout structure dynamically using LLM
            structure_rules = await detect_pdf_structure(sample_text)

            # 3. Clean transcript using dynamic rules
            cleaned_text = clean_transcript_pdf(full_pdf_path, structure_rules)
            qa_chunks = extract_qa(cleaned_text, structure_rules)

            # Save cleaned data to storage/output directory
            output_dir = os.path.join(settings.STORAGE_PATH, "output")
            os.makedirs(output_dir, exist_ok=True)

            # 1. Save as proofcleaned.txt
            proofcleaned_path = os.path.join(output_dir, "proofcleaned.txt")
            with open(proofcleaned_path, "w", encoding="utf-8") as f:
                f.write(cleaned_text)

            # 2. Save as task-specific file to avoid concurrent task overwrites
            task_cleaned_path = os.path.join(output_dir, f"{context.task_id}_cleaned.txt")
            with open(task_cleaned_path, "w", encoding="utf-8") as f:
                f.write(cleaned_text)

            logger.info(f"Saved cleaned transcript to: {proofcleaned_path} and {task_cleaned_path}")
        except Exception as e:
            logger.error(f"Error processing PDF: {e}")
            raise e

        # Save to database
        if context.db:
            result = await context.db.execute(
                select(Transcript).where(Transcript.task_id == context.task_id)
            )
            transcript = result.scalar_one_or_none()

            if not transcript:
                transcript = Transcript(
                    task_id=context.task_id,
                    content=None,
                    language="en",
                    cleaned_content=cleaned_text,
                    chunks=qa_chunks
                )
                context.db.add(transcript)
            else:
                transcript.cleaned_content = cleaned_text
                transcript.chunks = qa_chunks
        else:
            logger.warning("Database session not available in context.")

        context.processed_data = {
            "cleaned": True,
            "chunks_extracted": len(qa_chunks),
            "proofcleaned_path": os.path.join("output", "proofcleaned.txt"),
            "task_cleaned_path": os.path.join("output", f"{context.task_id}_cleaned.txt"),
        }

        context.metadata["data_processing"] = {
            "chunks_extracted": len(qa_chunks),
            "pdf_processed": pdf_path,
            "structure_rules": structure_rules,
            "proofcleaned_path": os.path.join("output", "proofcleaned.txt"),
            "task_cleaned_path": os.path.join("output", f"{context.task_id}_cleaned.txt"),
        }

        return context

