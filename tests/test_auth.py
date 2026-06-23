"""
Tests for authentication endpoints using OTP.
"""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from app.models.otp import OTP


@pytest.mark.asyncio
class TestAuthEndpoints:
    """Test auth flows."""

    async def test_register_success(self, client: AsyncClient, db_session):
        """Test successful user registration using OTP."""
        email = f"newuser_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Request signup OTP
        response = await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "New",
                "last_name": "User",
            },
        )
        assert response.status_code == 200
        assert response.json()["message"] == "OTP sent successfully"

        # 2. Retrieve OTP code from DB
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        otp_record = result.scalars().first()
        assert otp_record is not None
        code = otp_record.code

        # 3. Verify OTP and complete registration
        verify_response = await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": code,
                "first_name": "New",
                "last_name": "User",
            },
        )
        assert verify_response.status_code == 200
        data = verify_response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_email(self, client: AsyncClient, db_session):
        """Test registration with duplicate email."""
        email = f"duplicate_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Request and complete registration for first user
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "First",
                "last_name": "User",
            },
        )
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        code = result.scalars().first().code
        await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": code,
                "first_name": "First",
                "last_name": "User",
            },
        )

        # 2. Try to request signup again with the same email
        response = await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Second",
                "last_name": "User",
            },
        )
        assert response.status_code == 409

    async def test_login_success(self, client: AsyncClient, db_session):
        """Test successful login using OTP."""
        email = f"loginuser_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Register first
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Login",
                "last_name": "User",
            },
        )
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        code = result.scalars().first().code
        await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": code,
                "first_name": "Login",
                "last_name": "User",
            },
        )

        # 2. Request Login OTP
        response = await client.post(
            "/api/v1/auth/login/request",
            json={"email": email},
        )
        assert response.status_code == 200

        # 3. Retrieve new login OTP from DB
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        otp_record = result.scalars().first()
        assert otp_record is not None
        login_code = otp_record.code

        # 4. Verify login OTP
        verify_response = await client.post(
            "/api/v1/auth/login/verify",
            json={
                "email": email,
                "code": login_code,
            },
        )
        assert verify_response.status_code == 200
        assert "access_token" in verify_response.json()

    async def test_login_wrong_otp(self, client: AsyncClient, db_session):
        """Test login with wrong OTP."""
        email = f"wrongotp_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Register user
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Wrong",
                "last_name": "Otp",
            },
        )
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        code = result.scalars().first().code
        await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": code,
                "first_name": "Wrong",
                "last_name": "Otp",
            },
        )

        # 2. Request login
        await client.post(
            "/api/v1/auth/login/request",
            json={"email": email},
        )

        # 3. Verify with incorrect code
        response = await client.post(
            "/api/v1/auth/login/verify",
            json={
                "email": email,
                "code": "0000",  # incorrect code
            },
        )
        assert response.status_code == 401

    async def test_refresh_token(self, client: AsyncClient, db_session):
        """Test token refresh."""
        email = f"refreshuser_{uuid.uuid4().hex[:8]}@example.com"

        # 1. Register to get tokens
        await client.post(
            "/api/v1/auth/signup/request",
            json={
                "email": email,
                "first_name": "Refresh",
                "last_name": "User",
            },
        )
        result = await db_session.execute(
            select(OTP).where(OTP.email == email)
        )
        code = result.scalars().first().code
        reg_response = await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": email,
                "code": code,
                "first_name": "Refresh",
                "last_name": "User",
            },
        )
        refresh_token = reg_response.json()["refresh_token"]

        # 2. Refresh
        response = await client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        assert "access_token" in response.json()

    async def test_register_validation_invalid_otp(self, client: AsyncClient):
        """Test registration verification validation errors."""
        response = await client.post(
            "/api/v1/auth/signup/verify",
            json={
                "email": "validation@example.com",
                "code": "123",  # invalid code length
                "first_name": "Val",
                "last_name": "Idation",
            },
        )
        assert response.status_code == 422  # Validation error
