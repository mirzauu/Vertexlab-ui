import sys
import fitz
from app.pipeline.steps.data_processing import clean_transcript_pdf, detect_pdf_structure, extract_qa
import asyncio

async def main():
    pdf_path = sys.argv[1]
    
    # Dump raw text of first 15 pages
    doc = fitz.open(pdf_path)
    raw_text = ""
    for i in range(min(15, len(doc))):
        page = doc.load_page(i)
        raw_text += f"\n--- PAGE {i+1} ---\n" + page.get_text("text")
    doc.close()
    
    with open("raw_pdf_output.txt", "w", encoding="utf-8") as f:
        f.write(raw_text)
        
    print("Raw text written to raw_pdf_output.txt")
    
    # Also dump cleaned_text
    sample_text = raw_text[:8000]
    structure_rules = await detect_pdf_structure(sample_text)
    cleaned_text = clean_transcript_pdf(pdf_path, structure_rules)
    
    with open("cleaned_text_output.txt", "w", encoding="utf-8") as f:
        f.write(cleaned_text)
        
    print("Cleaned text written to cleaned_text_output.txt")

if __name__ == "__main__":
    asyncio.run(main())
