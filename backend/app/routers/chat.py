from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import get_settings
from app.services.store import make_store
from app.services.llm_service import run_turn, make_client
from app.sse import sse_event

router = APIRouter(prefix="/api/sessions", tags=["chat"])


class ChatBody(BaseModel):
    message: str


@router.post("/{session_id}/chat")
async def chat(session_id: str, body: ChatBody):
    store = make_store()
    client = make_client()
    model = get_settings().model

    store.add_message(session_id, "user", body.message)
    history = [{"role": m["role"], "content": m["content"]}
               for m in store.get_messages(session_id)]
    current_plan = store.get_plan(session_id)

    async def save_plan(plan: dict) -> None:
        store.save_plan(session_id, plan)

    async def event_stream():
        assistant_text: list[str] = []
        async for event, data in run_turn(
            client, model, history, current_plan, save_plan
        ):
            if event == "token":
                assistant_text.append(data["text"])
            yield sse_event(event, data)
        # persist the assistant's chat text for multi-turn continuity
        text = "".join(assistant_text).strip()
        if text:
            store.add_message(session_id, "assistant", text)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
