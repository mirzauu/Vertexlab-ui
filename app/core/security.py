"""
JWT token creation/verification and password hashing utilities.
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
import bcrypt

from app.config import settings
from app.core.exceptions import UnauthorizedError


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    # bcrypt requires bytes
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a hash."""
    pwd_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)



def create_access_token(user_id: UUID, extra_claims: dict | None = None) -> str:
    """Create a JWT access token."""
    payload = {
        "sub": str(user_id),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user_id: UUID) -> str:
    """Create a JWT refresh token."""
    payload = {
        "sub": str(user_id),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises UnauthorizedError on failure."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("sub") is None:
            raise UnauthorizedError("Invalid token: missing subject")
        return payload
    except JWTError as e:
        raise UnauthorizedError(f"Invalid token: {str(e)}")
