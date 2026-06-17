from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.services.store import make_store
from app.services.pdf_service import extract_text
from app.services.llm_service import run_turn, make_client
from app.services.progress import merge_completion
from app.sse import sse_event

router = APIRouter(prefix="/api/sessions", tags=["syllabus"])


@router.post("/{session_id}/syllabus")
async def import_syllabus(session_id: str, file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = extract_text(raw)
    except ValueError as exc:
        async def err():
            yield sse_event("error", {"message": str(exc)})
            yield sse_event("done", {})
        return StreamingResponse(err(), media_type="text/event-stream")

    store = make_store()
    client = make_client()
    model = get_settings().model
    instruction = (
        "Here is an existing syllabus a mentor wants to restructure into a better "
        "course plan. Improve and restructure it, then save with update_course_plan. "
        "Ask follow-up questions only if essential.\n\n--- SYLLABUS ---\n" + text[:20000]
    )
    store.add_message(session_id, "user", instruction)
    history = [{"role": m["role"], "content": m["content"]}
               for m in store.get_messages(session_id)]
    current_plan = store.get_plan(session_id)

    async def save_plan(plan: dict) -> dict:
        merged = merge_completion(store.get_plan(session_id), plan)
        store.save_plan(session_id, merged)
        title = (merged.get("title") or "").strip()
        if title:
            store.update_session_title(session_id, title)
        return merged

    async def event_stream():
        assistant_text = []
        async for event, data in run_turn(client, model, history, current_plan, save_plan):
            if event == "token":
                assistant_text.append(data["text"])
            yield sse_event(event, data)
        text_out = "".join(assistant_text).strip()
        if text_out:
            store.add_message(session_id, "assistant", text_out)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
