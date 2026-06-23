import sys
import os
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.pipeline.steps.data_processing import extract_qa

def main():
    cleaned_txt = r"d:\projects\verbalex_backend\proofcleaned.txt"
    if not os.path.exists(cleaned_txt):
        print(f"Error: Run test_clean.py first to generate {cleaned_txt}")
        sys.exit(1)
        
    print(f"Reading cleaned text from: {cleaned_txt}")
    with open(cleaned_txt, "r", encoding="utf-8") as f:
        text = f.read()
        
    print("Extracting QA pairs using the new block sequence parser...")
    qa_pairs = extract_qa(text)
    
    print(f"\nTotal Q&A pairs extracted: {len(qa_pairs)}")
    
    # Find some QA pairs with objections to display
    with_objections = [qa for qa in qa_pairs if qa["objection"]]
    print(f"Q&A pairs with objections found: {len(with_objections)}")
    
    print("\n--- Displaying First 3 Q&A Pairs ---")
    for i in range(min(3, len(qa_pairs))):
        print(json.dumps(qa_pairs[i], indent=2))
        print("-" * 50)
        
    if with_objections:
        print("\n--- Displaying First 2 Q&A Pairs WITH Objections ---")
        for i in range(min(2, len(with_objections))):
            print(json.dumps(with_objections[i], indent=2))
            print("-" * 50)

if __name__ == "__main__":
    main()
