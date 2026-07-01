"""
Tests for Super Admin endpoints.
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4


@pytest.mark.asyncio
class TestSuperAdminEndpoints:
    """Test superadmin operations."""

    async def _get_auth_token(self, client: AsyncClient, email: str, name: str) -> str:
        """Helper to get auth token for a user (logs in if exists, registers if not)."""
        # Try login first
        login_req = await client.post(
            "/api/v1/auth/login/request",
            json={"email": email}
        )
        
        if login_req.status_code == 200:
            # User exists, complete login verification
            verify = await client.post(
                "/api/v1/auth/login/verify",
                json={"email": email, "code": "1234"}
            )
            assert verify.status_code == 200
            return verify.json()["access_token"]
        else:
            # User does not exist, sign up
            await client.post(
                "/api/v1/auth/signup/request",
                json={
                    "email": email,
                    "first_name": name,
                    "last_name": "Test",
                }
            )
            verify = await client.post(
                "/api/v1/auth/signup/verify",
                json={
                    "email": email,
                    "code": "1234",
                    "first_name": name,
                    "last_name": "Test",
                }
            )
            assert verify.status_code == 200
            return verify.json()["access_token"]

    async def test_access_denied_for_regular_user(self, client: AsyncClient):
        """Test that regular users receive 403 Forbidden on superadmin endpoints."""
        email = f"regular_{uuid4().hex[:6]}@example.com"
        token = await self._get_auth_token(client, email, "Regular")
        headers = {"Authorization": f"Bearer {token}"}

        # Try to access stats
        response = await client.get("/api/v1/superadmin/stats", headers=headers)
        assert response.status_code == 403
        assert "Super Admin privileges" in response.json()["detail"]

    async def test_stats_and_queries_for_superadmin(self, client: AsyncClient):
        """Test that the superadmin (mirzamailbox0@gmail.com) can access stats and lists."""
        token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Test Stats
        response = await client.get("/api/v1/superadmin/stats", headers=headers)
        assert response.status_code == 200
        stats = response.json()
        assert "users" in stats
        assert "organizations" in stats
        assert "tasks" in stats

        # 2. Test List Users
        response = await client.get("/api/v1/superadmin/users", headers=headers)
        assert response.status_code == 200
        users_data = response.json()
        assert "items" in users_data
        assert "total" in users_data

        # 3. Test List Organizations
        response = await client.get("/api/v1/superadmin/organizations", headers=headers)
        assert response.status_code == 200
        orgs_data = response.json()
        assert "items" in orgs_data

        # 4. Test List Tasks
        response = await client.get("/api/v1/superadmin/tasks", headers=headers)
        assert response.status_code == 200
        tasks_data = response.json()
        assert "items" in tasks_data

    async def test_toggle_user_active(self, client: AsyncClient):
        """Test deactivating and reactivating a user by the superadmin."""
        # Authenticate superadmin
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create target user to deactivate
        target_email = f"target_{uuid4().hex[:6]}@example.com"
        await self._get_auth_token(client, target_email, "Target")

        # Get target user's user ID from user list
        users_response = await client.get("/api/v1/superadmin/users", headers=headers)
        assert users_response.status_code == 200
        users = users_response.json()["items"]
        
        target_user_id = None
        for u in users:
            if u["email"] == target_email:
                target_user_id = u["id"]
                break
        
        assert target_user_id is not None

        # Deactivate
        response = await client.put(f"/api/v1/superadmin/users/{target_user_id}/toggle-active", headers=headers)
        assert response.status_code == 200
        assert response.json()["is_active"] is False

        # Reactivate
        response = await client.put(f"/api/v1/superadmin/users/{target_user_id}/toggle-active", headers=headers)
        assert response.status_code == 200
        assert response.json()["is_active"] is True

    async def test_impersonate_user_success(self, client: AsyncClient):
        """Test that the superadmin can successfully impersonate an active user."""
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create target user to impersonate
        target_email = f"impersonate_{uuid4().hex[:6]}@example.com"
        await self._get_auth_token(client, target_email, "ImpersonateTarget")

        # Get target user's ID
        users_response = await client.get("/api/v1/superadmin/users", headers=headers)
        assert users_response.status_code == 200
        users = users_response.json()["items"]
        target_user_id = next(u["id"] for u in users if u["email"] == target_email)

        # Trigger impersonation
        response = await client.post(f"/api/v1/superadmin/users/{target_user_id}/impersonate", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_impersonate_user_denied_for_regular_user(self, client: AsyncClient):
        """Test that a regular user cannot request impersonation tokens."""
        regular_email = f"regular_{uuid4().hex[:6]}@example.com"
        regular_token = await self._get_auth_token(client, regular_email, "Regular")
        headers = {"Authorization": f"Bearer {regular_token}"}

        # Try to impersonate
        response = await client.post(f"/api/v1/superadmin/users/{uuid4()}/impersonate", headers=headers)
        assert response.status_code == 403
        assert "Super Admin privileges" in response.json()["detail"]

    async def test_impersonate_user_deactivated_fails(self, client: AsyncClient):
        """Test that impersonating a deactivated user returns a 400 error."""
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create user to deactivate
        target_email = f"deact_{uuid4().hex[:6]}@example.com"
        await self._get_auth_token(client, target_email, "DeactTarget")

        # Get target ID
        users_response = await client.get("/api/v1/superadmin/users", headers=headers)
        users = users_response.json()["items"]
        target_user_id = next(u["id"] for u in users if u["email"] == target_email)

        # Deactivate user
        await client.put(f"/api/v1/superadmin/users/{target_user_id}/toggle-active", headers=headers)

        # Attempt impersonation
        response = await client.post(f"/api/v1/superadmin/users/{target_user_id}/impersonate", headers=headers)
        assert response.status_code == 400
        assert "deactivated user" in response.json()["detail"].lower()

