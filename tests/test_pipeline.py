"""
Tests for pipeline endpoints.
"""

import pytest
from uuid import uuid4
from httpx import AsyncClient


@pytest.mark.asyncio
class TestPipelineEndpoints:
    """Test pipeline execution and status."""

    async def _setup(self, client: AsyncClient) -> tuple[str, str, dict]:
        """Helper: register, create org, create task. Returns (org_id, task_id, headers)."""
        email = f"pipeuser_{uuid4().hex[:6]}@example.com"
        # Request signup OTP
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Pipeline",
                "last_name": "User",
            },
        )
        # Verify signup OTP with bypass code
        reg = await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": "1234",
                "first_name": "Pipeline",
                "last_name": "User",
            },
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        org_resp = await client.post(
            "/api/v1/organizations/",
            json={"name": "Pipeline Org"},
            headers=headers,
        )
        org_id = org_resp.json()["id"]

        task_resp = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={"name": "Pipeline Test Task"},
            headers=headers,
        )
        task_id = task_resp.json()["id"]

        return org_id, task_id, headers

    async def test_trigger_pipeline(self, client: AsyncClient):
        """Test triggering a pipeline execution."""
        org_id, task_id, headers = await self._setup(client)

        response = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/run",
            headers=headers,
        )
        assert response.status_code == 202
        data = response.json()
        assert "pipeline_run_id" in data
        assert data["message"] == "Pipeline started successfully"

    async def test_get_pipeline_status(self, client: AsyncClient):
        """Test getting pipeline status after trigger."""
        org_id, task_id, headers = await self._setup(client)

        # Trigger pipeline
        await client.post(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/run",
            headers=headers,
        )

        # Get status
        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/status",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "steps" in data
        assert len(data["steps"]) == 5  # 5 pipeline steps

    async def test_pipeline_not_found(self, client: AsyncClient):
        """Test getting status for task without pipeline."""
        org_id, task_id, headers = await self._setup(client)

        # Get status
        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/status",
            headers=headers,
        )
        assert response.status_code == 404

    async def test_get_document_pdf(self, client: AsyncClient):
        """Test getting AI document PDF endpoint."""
        org_id, task_id, headers = await self._setup(client)

        # 1. First request should return 404 (no AI document generated yet)
        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/document/pdf",
            headers=headers,
        )
        assert response.status_code == 404

        # 2. Insert a mock AI document manually using db_session
        from app.db.session import AsyncSessionLocal
        from app.models.ai_document import AIDocument
        import uuid

        async with AsyncSessionLocal() as session:
            doc = AIDocument(
                task_id=uuid.UUID(task_id),
                title="AI-Corrected Proof Document",
                content="Mock document content",
                version=1,
                is_draft=True,
                corrected_chunks=[
                    {
                        "raw_chunk_id": 1,
                        "original_raw_text": "Q: Hello? A: Hi.",
                        "corrected_text": "Q: Hello? A: Hi.",
                        "match_status": "matched",
                        "confidence_score": 90.0,
                        "audio_start_time_sec": 10.0,
                        "audio_end_time_sec": 12.0,
                        "speakers": ["Speaker 1"]
                    }
                ]
            )
            session.add(doc)
            await session.commit()

        # 3. Request the PDF download
        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/document/pdf",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.headers["Content-Type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")

    async def test_get_pipeline_results(self, client: AsyncClient):
        """Test getting detailed results containing the AI document."""
        org_id, task_id, headers = await self._setup(client)

        # 1. Trigger pipeline to create PipelineRun record
        await client.post(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/run",
            headers=headers,
        )

        # 2. Insert a mock AI document and a mock transcript manually using db_session
        from app.db.session import AsyncSessionLocal
        from app.models.ai_document import AIDocument
        from app.models.transcript import Transcript
        import uuid

        async with AsyncSessionLocal() as session:
            doc = AIDocument(
                task_id=uuid.UUID(task_id),
                title="AI-Corrected Proof Document",
                content="Mock document content",
                version=1,
                is_draft=True,
                corrected_chunks=[
                    {
                        "raw_chunk_id": 1,
                        "original_raw_text": "Q: Hello? A: Hi.",
                        "corrected_text": "Q: Hello? A: Hi.",
                        "match_status": "matched",
                        "confidence_score": 90.0,
                        "audio_start_time_sec": 10.0,
                        "audio_end_time_sec": 12.0,
                        "speakers": ["Speaker 1"]
                    }
                ]
            )
            transcript = Transcript(
                task_id=uuid.UUID(task_id),
                content={"segments": []},
                language="en",
                confidence_score=0.95,  # NUMERIC(5,4): max ~9.9999, so use 0–1 fractional range
            )
            session.add(doc)
            session.add(transcript)
            await session.commit()

        # 3. Call results endpoint
        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}/pipeline/results",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "document" in data
        assert data["document"] is not None
        assert data["document"]["title"] == "AI-Corrected Proof Document"
        assert data["document"]["corrected_chunks"][0]["raw_chunk_id"] == 1

