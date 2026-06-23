"""
Test configuration and fixtures.
"""

import asyncio
import pytest
import pytest_asyncio
from uuid import uuid4
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.security import create_access_token, hash_password
from app.db.session import AsyncSessionLocal
from app.models.user import User, AuthProvider, UserSettings


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def clear_connections():
    yield
    from app.db.session import engine
    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    """Create an async HTTP test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    """Create a database session for testing."""
    async with AsyncSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def test_user(db_session):
    """Create a test user in the database."""
    user = User(
        id=uuid4(),
        email=f"test_{uuid4().hex[:8]}@example.com",
        password_hash=hash_password("TestPass123!"),
        first_name="Test",
        last_name="User",
        auth_provider=AuthProvider.LOCAL,
    )
    db_session.add(user)
    await db_session.flush()

    settings = UserSettings(user_id=user.id)
    db_session.add(settings)
    await db_session.flush()

    return user


@pytest_asyncio.fixture
async def auth_headers(test_user):
    """Create authorization headers with a valid JWT."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def authenticated_client(client, auth_headers):
    """Create an authenticated client with default headers."""
    client.headers.update(auth_headers)
    return client
