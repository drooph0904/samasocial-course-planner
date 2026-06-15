"""Environment configuration. Fails fast with a clear message if required
variables are missing."""
import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

REQUIRED = ["ANTHROPIC_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]


class Settings:
    def __init__(self) -> None:
        missing = [k for k in REQUIRED if not os.getenv(k)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Copy backend/.env.example to backend/.env and fill them in."
            )
        self.anthropic_api_key = os.environ["ANTHROPIC_API_KEY"]
        self.model = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")
        self.supabase_url = os.environ["SUPABASE_URL"]
        self.supabase_service_key = os.environ["SUPABASE_SERVICE_KEY"]
        self.frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")


@lru_cache
def get_settings() -> Settings:
    return Settings()
