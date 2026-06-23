import sys
import os

# Add the workspace root to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.pipeline.steps.data_processing import clean_transcript_pdf

def main():
    input_pdf = r"d:\projects\verbalex_backend\SAKHAI -v- DELKAP.rawfile.POCgarryAI.pdf"
    output_txt = r"d:\projects\verbalex_backend\proofcleaned.txt"
    
    if not os.path.exists(input_pdf):
        print(f"Error: Input file not found at {input_pdf}")
        sys.exit(1)
        
    print(f"Cleaning PDF: {input_pdf} ...")
    try:
        cleaned_text = clean_transcript_pdf(input_pdf)
        
        with open(output_txt, "w", encoding="utf-8") as f:
            f.write(cleaned_text)
            
        print(f"Success! Cleaned text saved to: {output_txt}")
        print(f"File size: {os.path.getsize(output_txt)} bytes")
    except Exception as e:
        print(f"Error running clean_transcript_pdf: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
