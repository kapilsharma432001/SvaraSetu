from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SvaraSetu"
    database_url: str = "sqlite:///./data/svarasetu.db"
    google_client_secrets_file: Path = Path("./client_secret.json")
    oauth_redirect_uri: str = "http://localhost:8000/auth/callback"
    frontend_url: str = "http://localhost:5173"
    backend_cors_origins: str = "http://localhost:5173"
    youtube_scope: str = "https://www.googleapis.com/auth/youtube.force-ssl"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def backend_cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
