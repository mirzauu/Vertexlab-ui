"""
Analysis pipeline step.
Generates embeddings from DataProcessing chunks and upserts to Pinecone.
"""

import logging
from sqlalchemy import select
from pinecone import Pinecone

from app.pipeline.base import BasePipelineStep, PipelineContext
from app.models.transcript import Transcript
from app.config import settings

logger = logging.getLogger(__name__)

# Keep a global cache for the loaded model so it isn't repeatedly loaded.
_embed_model = None

def get_embed_model():
    global _embed_model
    if _embed_model is None:
        logger.info("Initializing SentenceTransformer model ('all-MiniLM-L6-v2')...")
        try:
            from sentence_transformers import SentenceTransformer
            _embed_model = SentenceTransformer('all-MiniLM-L6-v2')
        except Exception as e:
            logger.error(f"Failed to load SentenceTransformer model: {e}")
            raise RuntimeError(f"SentenceTransformer model failed to load: {e}")
    return _embed_model

class AnalysisStep(BasePipelineStep):
    """Embeds extracted QA chunks and stores them in Pinecone."""

    @property
    def name(self) -> str:
        return "analysis"

    async def execute(self, context: PipelineContext) -> PipelineContext:
        if not context.db:
            logger.warning("No DB session in context, skipping AnalysisStep")
            return context

        try:
            model = get_embed_model()
        except Exception as e:
            raise RuntimeError(f"Cannot execute AnalysisStep because: {e}")

        # 1. Fetch chunks from Transcript table
        result = await context.db.execute(
            select(Transcript).where(Transcript.task_id == context.task_id)
        )
        transcript = result.scalar_one_or_none()

        if not transcript or not transcript.chunks:
            logger.warning("No transcript chunks found for this task.")
            return context

        chunks = transcript.chunks
        
        # 2. Setup Pinecone
        if not settings.PINECONE_API_KEY:
            logger.warning("PINECONE_API_KEY is not set. Skipping vector upsert.")
            return context
            
        pc = Pinecone(api_key=settings.PINECONE_API_KEY)
        index = pc.Index(settings.PINECONE_INDEX_NAME)

        # 3. Generate Embeddings & Upsert
        vectors = []
        for i, chunk in enumerate(chunks):
            # Extract the text to embed
            text = chunk.get("combined") or chunk.get("text", "")
            if not text:
                continue

            # Generate embedding
            embedding = model.encode(text).tolist()

            # Prepare Pinecone vector format
            vector_id = f"task_{context.task_id}_chunk_{i}"
            
            # Prepare metadata
            metadata = {
                "task_id": str(context.task_id),
                "organization_id": str(context.organization_id),
                "chunk_id": chunk.get("id", i),
                "text": text
            }
            if "question" in chunk:
                metadata["question"] = chunk["question"]
            if "answer" in chunk:
                metadata["answer"] = chunk["answer"]

            vectors.append({
                "id": vector_id,
                "values": embedding,
                "metadata": metadata
            })

        if vectors:
            logger.info(f"Upserting {len(vectors)} vectors to Pinecone index '{settings.PINECONE_INDEX_NAME}'")
            # Upsert in batches of 100 to avoid payload size limits
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                index.upsert(vectors=batch)

        context.analysis_result = {
            "embedded_chunks_count": len(vectors),
            "pinecone_index": settings.PINECONE_INDEX_NAME,
        }

        context.metadata["analysis"] = {
            "embedded_chunks_count": len(vectors),
            "pinecone_index": settings.PINECONE_INDEX_NAME,
        }

        return context

