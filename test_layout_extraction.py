"""
Test script to verify dynamic PDF layout profile extraction and exact-layout PDF generation.
"""

import os
import sys
import json
import fitz

# Set standard output encoding to UTF-8
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

from app.utils.pdf_layout import extract_pdf_layout_profile
from app.services.pipeline_service import PipelineService

def test_extraction_and_generation():
    test_files = [
        "SAKHAI -v- DELKAP.rawfile.POCgarryAI.pdf",
        "sakhai case 2_ai_corrected (6).pdf",
        "test2_ai_corrected (8).pdf"
    ]

    sample_lines = [
        "MR. TAIWO:  Good afternoon Mr. Sakhai, can you please state your full name and address for the record?",
        "THE WITNESS:  Benjamin Sakhai, 123 Main Street, New York, New York.",
        "Q.  Are you currently employed?",
        "A.  Yes, I am.",
        "Q.  Where do you work?",
        "A.  I work at Delkap Management as a property manager.",
        "Q.  How long have you been employed there?",
        "A.  For approximately five years.",
        "MR. SMITH:  Objection to the form of the question.",
        "Q.  Did you witness the incident that occurred on December 15th?",
        "A.  Yes, I was present in the building when the leak was first reported.",
        "Q.  What actions did you take upon discovering the issue?",
        "A.  I immediately contacted our maintenance crew and notified the building superintendent.",
        "MR. TAIWO:  Let's mark this document as Plaintiff's Exhibit 1 for identification."
    ]

    # Create dummy pipeline service instance for helper testing
    service = PipelineService(db=None, task_repo=None, pipeline_repo=None)

    for file_name in test_files:
        if not os.path.exists(file_name):
            print(f"Skipping {file_name} (file not found)")
            continue

        print(f"\n==========================================")
        print(f"Testing Layout Profile for: {file_name}")
        print(f"==========================================")

        layout_profile = extract_pdf_layout_profile(file_name)
        print(json.dumps(layout_profile, indent=2))

        # Generate sample PDF with the extracted profile
        output_pdf_name = f"test_output_{os.path.splitext(file_name)[0][:15].strip()}.pdf"
        pdf_bytes = service._generate_pdf_from_lines(
            title=f"AI Corrected - {file_name}",
            lines=sample_lines,
            layout_profile=layout_profile
        )

        with open(output_pdf_name, "wb") as f:
            f.write(pdf_bytes)

        print(f"[SUCCESS] Generated output PDF: {output_pdf_name} ({len(pdf_bytes)} bytes)")

        # Verify generated PDF properties with fitz
        gen_doc = fitz.open(output_pdf_name)
        first_page = gen_doc[0]
        print(f"   Generated Page Rect: {first_page.rect}")
        print(f"   Generated Drawings (Vertical lines): {len(first_page.get_drawings())}")
        gen_doc.close()

if __name__ == "__main__":
    test_extraction_and_generation()
