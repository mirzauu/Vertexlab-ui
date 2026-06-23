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


def extract_qa(text: str) -> list[dict]:
    if not text:
        return []

    # Split final_output into blocks
    blocks = [b.strip() for b in text.split("\n\n") if b.strip()]

    # Regex to identify block type and strip prefixes
    q_pattern = re.compile(r'^Q\.\s*', re.IGNORECASE)
    a_pattern = re.compile(r'^A\.\s*', re.IGNORECASE)
    speaker_pattern = re.compile(r'^([A-Z][A-Z\s\(\)\.]+:)\s*')

    qa_pairs = []
    current_q = None
    current_objections = []
    
    first_q_found = False

    for block in blocks:
        # Check if it is a Question block
        if q_pattern.match(block):
            first_q_found = True
            current_q = q_pattern.sub("", block).strip()
            current_objections = []
        
        # Check if it is an Answer block
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
        
        # Check if it is an attorney comment / objection / colloquy
        elif speaker_pattern.match(block):
            if first_q_found and current_q is not None:
                # Attorney comments occurring between Q and A -> keep as objection
                current_objections.append(block)
            else:
                # Attorney comments occurring after A but before next Q -> discard!
                pass
                
        # Other standalone text blocks
        else:
            if first_q_found and current_q is not None:
                current_q += " " + block
            else:
                pass

    return qa_pairs


def clean_transcript_pdf(input_path: str) -> str:
    doc = fitz.open(input_path)
    all_lines = []

    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        text = page.get_text("text")
        lines = text.split('\n')
        
        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            
            if re.match(r'^\d{1,2}$', stripped):
                n = int(stripped)
                if 1 <= n <= 25:
                    continue
            
            junk_terms = [
                "Veritext", 
                "WWW.VERITEXT.COM", 
                "800-567-8568", 
                "973-410-4040", 
                "Veritext Legal Solutions"
            ]
            if any(term in stripped for term in junk_terms):
                continue
            
            if re.search(r'\d{3}-\d{3}-\d{4}', stripped):
                if len(stripped) < 20: 
                    continue
                else:
                    stripped = re.sub(r'\d{3}-\d{3}-\d{4}', '', stripped).strip()
            
            if re.match(r'^Page \d+$', stripped, re.IGNORECASE):
                continue
            
            stripped = re.sub(r'^\d{1,2}\s+', '', stripped)
            stripped = re.sub(r'\s+\d{1,2}$', '', stripped)

            if stripped:
                all_lines.append(stripped)

    speaker_pattern = re.compile(r'^([QA]\.|[A-Z][A-Z\s\(\)\.]+:)\s*')
    
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
            cleaned_text = clean_transcript_pdf(full_pdf_path)
            qa_chunks = extract_qa(cleaned_text)
            
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

            # We don't commit here, orchestrator flushes/commits
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
            "proofcleaned_path": os.path.join("output", "proofcleaned.txt"),
            "task_cleaned_path": os.path.join("output", f"{context.task_id}_cleaned.txt"),
        }

        return context

