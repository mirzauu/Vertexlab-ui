import sys
import os
import asyncio

# Add the workspace root to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.pipeline.steps.data_processing import clean_transcript_pdf, detect_pdf_structure

async def main():
    input_pdf = r"d:\projects\verbalex_backend\sakhai case 2_ai_corrected (6).pdf"
    output_txt = r"d:\projects\verbalex_backend\proofcleaned_sakhai_case2.txt"
    
    if not os.path.exists(input_pdf):
        print(f"Error: Input file not found at {input_pdf}")
        sys.exit(1)
        
    print(f"Reading first 5 pages of PDF: {input_pdf} ...")
    import fitz
    doc = fitz.open(input_pdf)
    sample_text_parts = []
    for i in range(min(5, len(doc))):
        page = doc.load_page(i)
        sample_text_parts.append(page.get_text("text"))
    sample_text = "\n--- PAGE BREAK ---\n".join(sample_text_parts)
    doc.close()
    
    print("Detecting PDF layout structure dynamically using OpenAI...")
    structure_rules = await detect_pdf_structure(sample_text)
    print("\nDetected Structure Rules:")
    import json
    print(json.dumps(structure_rules, indent=2))
    
    print("\nCleaning PDF with detected rules...")
    try:
        cleaned_text = clean_transcript_pdf(input_pdf, structure_rules)
        
        with open(output_txt, "w", encoding="utf-8") as f:
            f.write(cleaned_text)
            
        print(f"Success! Cleaned text saved to: {output_txt}")
        print(f"File size: {os.path.getsize(output_txt)} bytes")
    except Exception as e:
        print(f"Error running clean_transcript_pdf: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
