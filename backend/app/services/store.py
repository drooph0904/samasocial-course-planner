"""Supabase-backed persistence for sessions, messages, and plans.
The Supabase client is injected so the store is unit-testable with a fake."""
import uuid
from datetime import datetime, timezone
from typing import Any


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, client: Any) -> None:
        self._c = client

    def create_session(self, title: str) -> str:
        sid = str(uuid.uuid4())
        self._c.table("sessions").insert(
            {"id": sid, "title": title, "created_at": _now()}
        ).execute()
        return sid

    def get_session(self, session_id: str) -> dict | None:
        res = self._c.table("sessions").select("*").eq("id", session_id).execute()
        return res.data[0] if res.data else None

    def list_sessions(self) -> list[dict]:
        res = (
            self._c.table("sessions").select("*")
            .order("created_at", desc=True).execute()
        )
        return res.data or []

    def update_session_title(self, session_id: str, title: str) -> None:
        self._c.table("sessions").update({"title": title}).eq("id", session_id).execute()

    def delete_session(self, session_id: str) -> None:
        # messages + plans cascade-delete via FK (see supabase/schema.sql)
        self._c.table("sessions").delete().eq("id", session_id).execute()

    def add_message(self, session_id: str, role: str, content: Any) -> None:
        self._c.table("messages").insert({
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "role": role,
            "content": content,
            "created_at": _now(),
        }).execute()

    def get_messages(self, session_id: str) -> list[dict]:
        res = (
            self._c.table("messages").select("*")
            .eq("session_id", session_id)
            .order("created_at").execute()
        )
        return res.data or []

    def save_plan(self, session_id: str, plan: dict) -> None:
        self._c.table("plans").upsert(
            {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "plan": plan,
                "updated_at": _now(),
            },
            on_conflict="session_id",
        ).execute()

    def get_plan(self, session_id: str) -> dict | None:
        res = self._c.table("plans").select("*").eq("session_id", session_id).execute()
        return res.data[0]["plan"] if res.data else None


from functools import lru_cache


@lru_cache
def _client():
    from supabase import create_client
    from app.config import get_settings
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_service_key)


def make_store() -> "Store":
    # reuse one Supabase client across requests (creating one per request
    # added significant per-call latency)
    return Store(_client())
