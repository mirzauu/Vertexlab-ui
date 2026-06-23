"""
Tests for task endpoints.
"""

import pytest
from uuid import uuid4
from httpx import AsyncClient


@pytest.mark.asyncio
class TestTaskEndpoints:
    """Test task CRUD operations."""

    async def _create_org_and_auth(self, client: AsyncClient) -> tuple[str, dict]:
        """Helper: register user, create org, return (org_id, auth_headers)."""
        email = f"taskuser_{uuid4().hex[:6]}@example.com"
        # Request signup OTP
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Task",
                "last_name": "User",
            },
        )
        # Verify signup OTP with bypass code
        reg = await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": "1234",
                "first_name": "Task",
                "last_name": "User",
            },
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create org
        org_resp = await client.post(
            "/api/v1/organizations/",
            json={"name": "Test Org"},
            headers=headers,
        )
        org_id = org_resp.json()["id"]

        return org_id, headers

    async def test_create_task(self, client: AsyncClient):
        """Test creating a task."""
        org_id, headers = await self._create_org_and_auth(client)

        response = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={
                "name": "Deposition - Smith v. Jones",
                "description": "Audio processing for Smith deposition",
                "tags": ["deposition", "smith"],
            },
            headers=headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Deposition - Smith v. Jones"
        assert data["status"] == "queued"

    async def test_list_tasks(self, client: AsyncClient):
        """Test listing tasks with pagination."""
        org_id, headers = await self._create_org_and_auth(client)

        # Create multiple tasks
        for i in range(3):
            await client.post(
                f"/api/v1/organizations/{org_id}/tasks/",
                json={"name": f"Task {i}"},
                headers=headers,
            )

        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/?page=1&page_size=10",
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 3

    async def test_get_task(self, client: AsyncClient):
        """Test getting a specific task."""
        org_id, headers = await self._create_org_and_auth(client)

        create_resp = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={"name": "Get This Task"},
            headers=headers,
        )
        task_id = create_resp.json()["id"]

        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}",
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Get This Task"

    async def test_update_task(self, client: AsyncClient):
        """Test updating a task."""
        org_id, headers = await self._create_org_and_auth(client)

        create_resp = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={"name": "Original Name"},
            headers=headers,
        )
        task_id = create_resp.json()["id"]

        response = await client.put(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}",
            json={"name": "Updated Name", "status": "in_progress"},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"
        assert response.json()["status"] == "in_progress"

    async def test_delete_task(self, client: AsyncClient):
        """Test deleting a task."""
        org_id, headers = await self._create_org_and_auth(client)

        create_resp = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={"name": "Delete Me"},
            headers=headers,
        )
        task_id = create_resp.json()["id"]

        response = await client.delete(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}",
            headers=headers,
        )
        assert response.status_code == 200

        # Verify deletion
        get_resp = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{task_id}",
            headers=headers,
        )
        assert get_resp.status_code == 404

    async def test_task_not_found(self, client: AsyncClient):
        """Test getting a non-existent task."""
        org_id, headers = await self._create_org_and_auth(client)

        response = await client.get(
            f"/api/v1/organizations/{org_id}/tasks/{uuid4()}",
            headers=headers,
        )
        assert response.status_code == 404
