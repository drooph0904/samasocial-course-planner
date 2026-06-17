import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.store import make_store
from app.schemas import empty_plan

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class CreateSession(BaseModel):
    title: str = "Untitled course"


@router.post("")
def create_session(body: CreateSession):
    store = make_store()
    sid = store.create_session(body.title)
    store.save_plan(sid, empty_plan())
    return {"id": sid, "title": body.title}


@router.get("")
def list_sessions():
    store = make_store()
    return {"sessions": store.list_sessions()}


@router.delete("/{session_id}")
def delete_session(session_id: str):
    store = make_store()
    store.delete_session(session_id)
    return {"deleted": session_id}


@router.get("/{session_id}")
async def get_session(session_id: str):
    store = make_store()
    # run the three Supabase reads concurrently instead of sequentially
    session, messages, plan = await asyncio.gather(
        asyncio.to_thread(store.get_session, session_id),
        asyncio.to_thread(store.get_messages, session_id),
        asyncio.to_thread(store.get_plan, session_id),
    )
    if not session:
        return {"error": "not found"}
    return {"session": session, "messages": messages, "plan": plan or empty_plan()}
