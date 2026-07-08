import sys
import asyncio
from app.pipeline.steps.data_processing import clean_transcript_pdf, extract_qa, detect_pdf_structure
import fitz

async def main():
    pdf_path = sys.argv[1]
    
    print(f"Testing with PDF: {pdf_path}")
    
    # 1. Extract sample text for detection
    doc = fitz.open(pdf_path)
    sample_text_parts = []
    # First 3 pages
    for i in range(min(3, len(doc))):
        page = doc.load_page(i)
        sample_text_parts.append(f"--- PAGE {i+1} ---\n" + page.get_text("text"))
        
    # Middle 3 pages for Q&A
    mid_start = max(3, len(doc) // 2)
    for i in range(mid_start, min(mid_start + 3, len(doc))):
        page = doc.load_page(i)
        sample_text_parts.append(f"--- PAGE {i+1} ---\n" + page.get_text("text"))
        
    sample_text = "\n".join(sample_text_parts)
    doc.close()

    # 2. Detect layout structure
    structure_rules = await detect_pdf_structure(sample_text)
    print("Structure rules:", structure_rules)

    # 3. Clean
    cleaned_text = clean_transcript_pdf(pdf_path, structure_rules)
    print("Cleaned text (first 500 chars):\n", cleaned_text[:500])

    # 4. Extract
    qa_chunks = extract_qa(cleaned_text, structure_rules)
    print(f"Total chunks extracted: {len(qa_chunks)}")
    
    output_txt = "extracted_chunks_output.txt"
    with open(output_txt, "w", encoding="utf-8") as f:
        f.write(f"Total chunks extracted: {len(qa_chunks)}\n")
        f.write("="*40 + "\n\n")
        for chunk in qa_chunks:
            f.write(f"Chunk ID: {chunk['id']}\n")
            f.write(f"Combined: {chunk['combined']}\n")
            f.write("-" * 40 + "\n")
            
    print(f"All extracted chunks have been written to {output_txt}")

if __name__ == "__main__":
    asyncio.run(main())
