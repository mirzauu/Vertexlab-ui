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

    async def test_help_desk_endpoints_success(self, client: AsyncClient):
        """Test help threads retrieval, history retrieval, and replying as support."""
        # 1. Create a user and workspace, and send a help message from the user
        email = f"helpuser_{uuid4().hex[:6]}@example.com"
        user_token = await self._get_auth_token(client, email, "HelpUser")
        user_headers = {"Authorization": f"Bearer {user_token}"}

        # Create workspace org
        org_resp = await client.post(
            "/api/v1/organizations/",
            json={"name": "Help Desk Org"},
            headers=user_headers,
        )
        assert org_resp.status_code == 201
        org_id = org_resp.json()["id"]

        # Send support message
        send_msg_resp = await client.post(
            f"/api/v1/organizations/{org_id}/help/messages",
            json={"content": "Need help with STT pipeline."},
            headers=user_headers,
        )
        assert send_msg_resp.status_code == 200

        # Retrieve user ID
        users_resp = await client.get("/api/v1/users/me", headers=user_headers)
        user_id = users_resp.json()["id"]

        # 2. Authenticate as Super Admin and get threads
        super_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        super_headers = {"Authorization": f"Bearer {super_token}"}

        threads_resp = await client.get("/api/v1/superadmin/help/threads", headers=super_headers)
        assert threads_resp.status_code == 200
        threads = threads_resp.json()
        assert len(threads) > 0
        target_thread = next(t for t in threads if t["organization_id"] == org_id)
        assert target_thread["user_name"] == "HelpUser Test"
        assert target_thread["last_message_content"] != ""

        # 3. Retrieve thread message history as Super Admin
        history_resp = await client.get(
            f"/api/v1/superadmin/help/threads/{org_id}/messages",
            headers=super_headers,
        )
        assert history_resp.status_code == 200
        history = history_resp.json()
        assert len(history) > 0
        assert history[0]["content"] == "Need help with STT pipeline."

        # 4. Reply to the thread as technician
        reply_payload = {"content": "We are investigating the STT issue.", "user_id": user_id}
        reply_resp = await client.post(
            f"/api/v1/superadmin/help/threads/{org_id}/reply",
            json=reply_payload,
            headers=super_headers,
        )
        assert reply_resp.status_code == 200
        reply_data = reply_resp.json()
        assert reply_data["content"] == "We are investigating the STT issue."
        assert reply_data["sender_type"] == "support"
        assert reply_data["user_name"] == "Support Technician"

        # 5. Verify the user sees the reply as a support technician
        user_history_resp = await client.get(
            f"/api/v1/organizations/{org_id}/help/messages",
            headers=user_headers,
        )
        assert user_history_resp.status_code == 200
        user_history = user_history_resp.json()
        tech_reply = next(m for m in user_history if m["sender_type"] == "support")
        assert tech_reply["user_name"] == "Support Technician"
        assert tech_reply["content"] == "We are investigating the STT issue."

    async def test_help_desk_denied_for_regular_user(self, client: AsyncClient):
        """Test that regular users cannot access support desk routes."""
        email = f"reg_{uuid4().hex[:6]}@example.com"
        token = await self._get_auth_token(client, email, "Regular")
        headers = {"Authorization": f"Bearer {token}"}

        # Try threads
        resp = await client.get("/api/v1/superadmin/help/threads", headers=headers)
        assert resp.status_code == 403

        # Try reply
        resp = await client.post(f"/api/v1/superadmin/help/threads/{uuid4()}/reply", json={"content": "test", "user_id": str(uuid4())}, headers=headers)
        assert resp.status_code == 403

    async def test_delete_user_success(self, client: AsyncClient):
        """Test that the superadmin can delete a user."""
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create target user to delete
        target_email = f"delete_u_{uuid4().hex[:6]}@example.com"
        await self._get_auth_token(client, target_email, "DeleteTarget")

        # Get target user's ID
        users_response = await client.get("/api/v1/superadmin/users", headers=headers)
        users = users_response.json()["items"]
        target_user_id = next(u["id"] for u in users if u["email"] == target_email)

        # Delete user
        response = await client.delete(f"/api/v1/superadmin/users/{target_user_id}", headers=headers)
        assert response.status_code == 200
        assert "deleted successfully" in response.json()["message"]

        # Verify user is deleted
        users_response = await client.get("/api/v1/superadmin/users", headers=headers)
        users_after = users_response.json()["items"]
        assert not any(u["id"] == target_user_id for u in users_after)

    async def test_delete_organization_success(self, client: AsyncClient):
        """Test that the superadmin can delete an organization."""
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create user & organization first
        user_email = f"org_owner_{uuid4().hex[:6]}@example.com"
        user_token = await self._get_auth_token(client, user_email, "OrgOwner")
        user_headers = {"Authorization": f"Bearer {user_token}"}

        org_resp = await client.post(
            "/api/v1/organizations/",
            json={"name": "Org to Delete"},
            headers=user_headers,
        )
        assert org_resp.status_code == 201
        org_id = org_resp.json()["id"]

        # Delete organization as super admin
        response = await client.delete(f"/api/v1/superadmin/organizations/{org_id}", headers=headers)
        assert response.status_code == 200
        assert "deleted successfully" in response.json()["message"]

    async def test_delete_task_success(self, client: AsyncClient):
        """Test that the superadmin can delete a task."""
        superadmin_token = await self._get_auth_token(client, "mirzamailbox0@gmail.com", "SuperAdmin")
        headers = {"Authorization": f"Bearer {superadmin_token}"}

        # Create a user & organization
        user_email = f"task_creator_{uuid4().hex[:6]}@example.com"
        user_token = await self._get_auth_token(client, user_email, "TaskCreator")
        user_headers = {"Authorization": f"Bearer {user_token}"}

        org_resp = await client.post(
            "/api/v1/organizations/",
            json={"name": "Task Org"},
            headers=user_headers,
        )
        assert org_resp.status_code == 201
        org_id = org_resp.json()["id"]

        # Create a task in the organization
        task_resp = await client.post(
            f"/api/v1/organizations/{org_id}/tasks/",
            json={"name": "Test Task", "description": "Desc"},
            headers=user_headers,
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # Delete task as superadmin
        response = await client.delete(f"/api/v1/superadmin/tasks/{task_id}", headers=headers)
        assert response.status_code == 200
        assert "deleted successfully" in response.json()["message"]



