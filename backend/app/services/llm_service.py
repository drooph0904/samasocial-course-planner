"""The streaming agentic LLM loop (OpenAI Responses API): builds tools, converts
history, runs the loop, and yields SSE-ready events. Plan persistence + live push
happen when the model calls the custom `update_course_plan` function tool.

Uses the Responses API because it is the only OpenAI surface that combines the
hosted `web_search` tool (real, current resource links), a strict-schema function
tool, and token streaming in a single loop.
"""
import json
from collections.abc import Awaitable, Callable
from typing import Any, AsyncIterator

from openai import AsyncOpenAI

from app.config import get_settings
from app.prompts import SYSTEM_PROMPT
from app.schemas import COURSE_PLAN_JSON_SCHEMA

MAX_ITERS = 8


def build_tools() -> list[dict]:
    """Hosted web_search (real resources) + a strict custom function whose schema
    IS the course plan. Responses API function tools are flat (no nested
    `function` object), unlike Chat Completions."""
    return [
        {"type": "web_search"},
        {
            "type": "function",
            "name": "update_course_plan",
            "description": (
                "Save the complete, updated course plan. Always pass the FULL plan "
                "object; it replaces the previously saved plan."
            ),
            "parameters": COURSE_PLAN_JSON_SCHEMA,
            "strict": True,
        },
    ]


def to_openai_messages(history: list[dict], current_plan: dict | None) -> list[dict]:
    """Convert stored history (role/content strings) to Responses API input items.
    Appends the current plan JSON as context so refinement edits the existing plan."""
    msgs: list[dict] = [{"role": m["role"], "content": m["content"]} for m in history]
    if current_plan:
        note = (
            "[Current saved course plan — refine THIS when making changes]:\n"
            + json.dumps(current_plan)
        )
        if msgs and msgs[-1]["role"] == "user":
            msgs[-1] = {"role": "user", "content": f'{msgs[-1]["content"]}\n\n{note}'}
        else:
            msgs.append({"role": "user", "content": note})
    return msgs


async def run_turn(
    client: Any,
    model: str,
    messages: list[dict],
    current_plan: dict | None,
    save_plan: Callable[[dict], Awaitable[dict | None]],
) -> AsyncIterator[tuple[str, dict]]:
    """Run one chat turn as a streaming agentic loop. Yields (event, data) pairs:
    token, sources, plan_update, error, done.

    The hosted web_search tool runs server-side within a single response, so the
    loop only re-calls the API to satisfy `update_course_plan` function calls —
    chaining via `previous_response_id` until the model stops calling it."""
    tools = build_tools()
    # First request: full history. Continuations: only the function-call outputs.
    next_input: list[dict] = to_openai_messages(messages, current_plan)
    previous_response_id: str | None = None

    try:
        for _ in range(MAX_ITERS):
            kwargs: dict[str, Any] = {
                "model": model,
                "instructions": SYSTEM_PROMPT,
                "tools": tools,
                "input": next_input,
                "stream": True,
            }
            if previous_response_id:
                kwargs["previous_response_id"] = previous_response_id

            stream = await client.responses.create(**kwargs)

            response_id: str | None = None
            searches: list[str] = []
            function_calls: list[Any] = []

            async for event in stream:
                # capture the response id as early as it appears (for chaining)
                resp = getattr(event, "response", None)
                if resp is not None and getattr(resp, "id", None):
                    response_id = resp.id

                etype = getattr(event, "type", "")
                if etype == "response.output_text.delta":
                    yield ("token", {"text": event.delta})
                elif etype == "response.output_item.done":
                    item = getattr(event, "item", None)
                    itype = getattr(item, "type", None)
                    if itype == "web_search_call":
                        action = getattr(item, "action", None)
                        query = getattr(action, "query", None) if action else None
                        if query:
                            searches.append(query)
                    elif itype == "function_call":
                        function_calls.append(item)
                elif etype in ("response.failed", "response.error", "error"):
                    err = getattr(event, "response", None) or event
                    yield ("error", {"message": _error_text(err)})

            if searches:
                yield ("sources", {"searches": searches})

            plan_calls = [c for c in function_calls
                          if getattr(c, "name", None) == "update_course_plan"]
            if plan_calls:
                outputs: list[dict] = []
                for call in plan_calls:
                    plan = json.loads(call.arguments)
                    stored = await save_plan(plan)
                    yield ("plan_update", {"plan": stored or plan})
                    outputs.append({
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": "Plan saved.",
                    })
                # continue the assistant turn: feed outputs back, chain by id
                previous_response_id = response_id
                next_input = outputs
                continue

            # no function calls -> assistant turn is complete
            break
    except Exception as exc:  # surface a clean error to the client
        yield ("error", {"message": f"{type(exc).__name__}: {exc}"})

    yield ("done", {})


def _error_text(err: Any) -> str:
    e = getattr(err, "error", None) or err
    msg = getattr(e, "message", None)
    return msg if msg else str(err)


def make_client() -> AsyncOpenAI:
    return AsyncOpenAI(api_key=get_settings().openai_api_key)
