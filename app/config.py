"""
Application configuration loaded from environment variables.
Uses pydantic-settings for type-safe env parsing.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List
import json


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    # Database
    DATABASE_URL: str = Field(..., description="Supabase PostgreSQL connection string")

    # JWT
    SECRET_KEY: str = Field(..., description="JWT signing secret")
    ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7)

    # Google OAuth2
    GOOGLE_CLIENT_ID: str = Field(default="")
    GOOGLE_CLIENT_SECRET: str = Field(default="")

    # Deepgram
    DEEPGRAM_API_KEY: str = Field(default="")

    # Pinecone
    PINECONE_API_KEY: str = Field(default="")
    PINECONE_INDEX_NAME: str = Field(default="verbalex-index")

    # OpenAI
    OPENAI_API_KEY: str = Field(default="")
    OPENAI_MODEL: str = Field(default="gpt-4o")

    # File Storage
    STORAGE_PATH: str = Field(default="./storage")

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: str = Field(default="")
    CLOUDINARY_API_KEY: str = Field(default="")
    CLOUDINARY_API_SECRET: str = Field(default="")
    CLOUDINARY_SECURE: bool = Field(default=True)

    # CORS
    CORS_ORIGINS: str = Field(default='["http://localhost:5173","http://localhost:3000"]')

    # App
    APP_NAME: str = Field(default="VerbaLex AI")
    SUPPORT_EMAIL: str = Field(default="mirzamailbox0@gmail.com")
    DEBUG: bool = Field(default=False)

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from JSON string."""
        return json.loads(self.CORS_ORIGINS)

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
    }


# Singleton instance
settings = Settings()
