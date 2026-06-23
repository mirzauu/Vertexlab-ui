"""
Google OAuth2 token verification.
"""

import httpx
from app.core.exceptions import UnauthorizedError

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


async def verify_google_token(id_token: str) -> dict:
    """
    Verify a Google ID token and return user info.

    Returns:
        dict with keys: email, first_name, last_name, google_id, avatar_url
    """
    async with httpx.AsyncClient() as client:
        # Verify the ID token with Google
        response = await client.get(
            GOOGLE_TOKENINFO_URL,
            params={"id_token": id_token},
        )

        if response.status_code != 200:
            raise UnauthorizedError("Invalid Google token")

        token_data = response.json()

        # Verify email is present and verified
        if not token_data.get("email_verified", "false") == "true":
            raise UnauthorizedError("Google email not verified")

        email = token_data.get("email")
        if not email:
            raise UnauthorizedError("No email in Google token")

        return {
            "email": email,
            "first_name": token_data.get("given_name", ""),
            "last_name": token_data.get("family_name", ""),
            "google_id": token_data.get("sub"),
            "avatar_url": token_data.get("picture"),
        }
