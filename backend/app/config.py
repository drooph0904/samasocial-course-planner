"""Environment configuration. Fails fast with a clear message if required
variables are missing."""
import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()

REQUIRED = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"]


class Settings:
    def __init__(self) -> None:
        missing = [k for k in REQUIRED if not os.getenv(k)]
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}. "
                f"Copy backend/.env.example to backend/.env and fill them in."
            )
        self.openai_api_key = os.environ["OPENAI_API_KEY"]
        # web_search (Responses API) requires a GPT-5+ model
        self.model = os.getenv("OPENAI_MODEL", "gpt-5.4")
        self.supabase_url = os.environ["SUPABASE_URL"]
        self.supabase_service_key = os.environ["SUPABASE_SERVICE_KEY"]
        # comma-separated list of allowed CORS origins (prod can list the Vercel URL)
        self.frontend_origins = [
            o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:3000").split(",") if o.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
