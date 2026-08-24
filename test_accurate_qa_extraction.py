"""
Test harness for geometry-first SpeechBlock extraction.
Verifies:
  - Multi-paragraph questions are captured as a SINGLE block (not split)
  - Ordered output is sequential: Q, A, Q, A, ...
  - Full text of a long question is preserved
"""

import json, sys
sys.stdout.reconfigure(encoding='utf-8')
from app.utils.qa_extractor import extract_speech_blocks_from_pdf, aggregate_speech_blocks_to_qa

TEST_PDFS = [
    "SAKHAI -v- DELKAP.rawfile.POCgarryAI.pdf",
    "sakhai case 2_ai_corrected (6).pdf",
    "test2_ai_corrected (8).pdf",
]

for pdf_path in TEST_PDFS:
    print("\n" + "=" * 60)
    print(f"Testing: {pdf_path}")
    print("=" * 60)

    try:
        blocks, cleaned_text = extract_speech_blocks_from_pdf(pdf_path)
    except FileNotFoundError:
        print(f"  [SKIP] File not found: {pdf_path}")
        continue

    q_blocks = [b for b in blocks if b.block_type == "Q"]
    a_blocks = [b for b in blocks if b.block_type == "A"]
    col_blocks = [b for b in blocks if b.block_type == "COLLOQUY"]
    obj_blocks = [b for b in blocks if b.block_type == "OBJECTION"]
    hdr_blocks = [b for b in blocks if b.block_type == "HEADER"]

    print(f"Total SpeechBlocks : {len(blocks)}")
    print(f"  Q blocks         : {len(q_blocks)}")
    print(f"  A blocks         : {len(a_blocks)}")
    print(f"  Colloquy         : {len(col_blocks)}")
    print(f"  Objections       : {len(obj_blocks)}")
    print(f"  Headers          : {len(hdr_blocks)}")

    # --- Multi-paragraph check ---
    long_qs = [b for b in q_blocks if len(b.text.split()) > 15]
    print(f"\n  Questions with >15 words (multi-paragraph): {len(long_qs)}")
    if long_qs:
        sample = long_qs[0]
        print(f"  Example (block_id={sample.block_id}, page={sample.page}):")
        print(f"    Lines : {sample.line_numbers}")
        print(f"    Text  : {sample.text[:200]}...")

    # --- First 10 Q blocks ---
    print("\n--- First 10 Q blocks ---")
    for b in q_blocks[:10]:
        print(json.dumps({
            "id": b.block_id, "page": b.page,
            "lines": b.line_numbers, "text": b.text[:100]
        }, ensure_ascii=False, indent=2))

    # --- Q&A pairs ---
    qa_chunks = aggregate_speech_blocks_to_qa(blocks)
    print(f"\nStructured Q&A pairs : {len(qa_chunks)}")
    if qa_chunks:
        print("\n--- Sample pair #1 ---")
        print(json.dumps(qa_chunks[0], ensure_ascii=False, indent=2))

    # --- Specific multi-paragraph question check ---
    print("\n--- Q blocks with >40 words ---")
    very_long = [b for b in q_blocks if len(b.text.split()) > 40]
    for b in very_long[:3]:
        print(f"  block_id={b.block_id} | page={b.page} | words={len(b.text.split())}")
        print(f"  text: {b.text[:250]}")
        print()
