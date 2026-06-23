import os
import sys

# Ensure app module can be found
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from sentence_transformers import SentenceTransformer
from pinecone import Pinecone
from app.config import settings

def test_embedding_and_pinecone():
    print("1. Loading SentenceTransformer model ('all-MiniLM-L6-v2')...")
    model = SentenceTransformer('all-MiniLM-L6-v2')
    
    text = "Q. Can you state your name for the record? A. My name is Test User."
    print(f"\n2. Encoding text: '{text}'")
    embedding = model.encode(text).tolist()
    
    print(f"   -> Successfully generated embedding of dimension: {len(embedding)}")
    
    print(f"\n3. Connecting to Pinecone index: '{settings.PINECONE_INDEX_NAME}'...")
    pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    index = pc.Index(settings.PINECONE_INDEX_NAME)
    
    print("\n4. Upserting test vector into Pinecone...")
    index.upsert(vectors=[
        {
            "id": "test_vector_1",
            "values": embedding,
            "metadata": {"text": text, "test": True}
        }
    ])
    print("   -> Successfully upserted!")
    
    print("\n5. Testing similarity search (retrieval)...")
    query_text = "What is your name?"
    query_embedding = model.encode(query_text).tolist()
    
    results = index.query(
        vector=query_embedding,
        top_k=1,
        include_metadata=True
    )
    
    print(f"   -> Search results for '{query_text}':")
    for match in results["matches"]:
        print(f"      - Match ID: {match['id']}")
        print(f"      - Score: {match['score']:.4f}")
        print(f"      - Metadata: {match['metadata']}")
        
    print("\n✅ All tests passed!")

if __name__ == "__main__":
    try:
        test_embedding_and_pinecone()
    except Exception as e:
        print(f"❌ Error occurred: {e}")
