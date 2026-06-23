import pytest
from app.pipeline.steps.data_processing import clean_text, extract_qa, clean_transcript_pdf

def test_clean_text():
    text = "  This   is a    test.  "
    assert clean_text(text) == "This is a test."

def test_extract_qa():
    text = "Q. What is your name?\n\nA. My name is John.\n\nQ. Where do you live?\n\nA. I live in NY."
    qa_pairs = extract_qa(text)
    
    assert len(qa_pairs) == 2
    assert qa_pairs[0]["question"] == "What is your name?"
    assert qa_pairs[0]["answer"] == "My name is John."
    assert qa_pairs[1]["question"] == "Where do you live?"
    assert qa_pairs[1]["answer"] == "I live in NY."

def test_extract_qa_with_multiline():
    text = "Q. Did you go to the store?\n\nAnd buy milk?\n\nA. Yes I did."
    qa_pairs = extract_qa(text)
    
    assert len(qa_pairs) == 1
    assert qa_pairs[0]["question"] == "Did you go to the store? And buy milk?"
    assert qa_pairs[0]["answer"] == "Yes I did."

