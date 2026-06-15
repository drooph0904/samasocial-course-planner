"""The streaming agentic Claude loop: builds tools, converts history, runs the
loop, and yields SSE-ready events. Plan persistence + live push happen when
Claude calls the custom `update_course_plan` tool."""
import json
from typing import Any, AsyncIterator

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.prompts import SYSTEM_PROMPT
from app.schemas import COURSE_PLAN_JSON_SCHEMA


def build_tools() -> list[dict]:
    return [
        {"type": "web_search_20260209", "name": "web_search"},
        {
            "type": "custom",
            "name": "update_course_plan",
            "description": (
                "Save the complete, updated course plan. Always pass the FULL plan "
                "object; it replaces the previously saved plan."
            ),
            "strict": True,
            "input_schema": COURSE_PLAN_JSON_SCHEMA,
        },
    ]


def to_anthropic_messages(history: list[dict], current_plan: dict | None) -> list[dict]:
    """Convert stored history (role/content strings) to Anthropic message params.
    Appends the current plan JSON as context so refinement edits the existing plan."""
    msgs: list[dict] = [{"role": m["role"], "content": m["content"]} for m in history]
    if current_plan:
        note = (
            "[Current saved course plan — refine THIS when making changes]:\n"
            + json.dumps(current_plan)
        )
        if msgs and msgs[-1]["role"] == "user":
            msgs[-1] = {
                "role": "user",
                "content": f'{msgs[-1]["content"]}\n\n{note}',
            }
        else:
            msgs.append({"role": "user", "content": note})
    return msgs


from collections.abc import Awaitable, Callable

MAX_ITERS = 8


async def run_turn(
    client: Any,
    model: str,
    messages: list[dict],
    current_plan: dict | None,
    save_plan: Callable[[dict], Awaitable[None]],
) -> AsyncIterator[tuple[str, dict]]:
    """Run one chat turn as a streaming agentic loop. Yields (event, data) pairs:
    token, sources, plan_update, error, done."""
    convo = to_anthropic_messages(messages, current_plan)
    tools = build_tools()

    try:
        for _ in range(MAX_ITERS):
            async with client.messages.stream(
                model=model,
                max_tokens=64000,
                system=SYSTEM_PROMPT,
                thinking={"type": "adaptive"},
                tools=tools,
                messages=convo,
            ) as stream:
                async for chunk in stream.text_stream:
                    yield ("token", {"text": chunk})
                final = await stream.get_final_message()

            # Surface any web searches performed (for source badges)
            searches = [
                b.input.get("query")
                for b in final.content
                if getattr(b, "type", None) == "server_tool_use"
                and getattr(b, "name", None) == "web_search"
                and isinstance(getattr(b, "input", None), dict)
            ]
            if searches:
                yield ("sources", {"searches": searches})

            if final.stop_reason == "pause_turn":
                # server tool loop limit — re-send to continue
                convo.append({"role": "assistant", "content": final.content})
                continue

            tool_uses = [
                b for b in final.content
                if getattr(b, "type", None) == "tool_use"
            ]
            if final.stop_reason == "tool_use" and tool_uses:
                convo.append({"role": "assistant", "content": final.content})
                results = []
                for tu in tool_uses:
                    if tu.name == "update_course_plan":
                        await save_plan(tu.input)
                        yield ("plan_update", {"plan": tu.input})
                        results.append({
                            "type": "tool_result",
                            "tool_use_id": tu.id,
                            "content": "Plan saved.",
                        })
                convo.append({"role": "user", "content": results})
                continue

            # end_turn / refusal / anything else terminal
            if final.stop_reason == "refusal":
                yield ("token", {"text": "\n[I can't help with that request.]"})
            break
    except Exception as exc:  # surface a clean error to the client
        yield ("error", {"message": f"{type(exc).__name__}: {exc}"})

    yield ("done", {})


def make_client() -> AsyncAnthropic:
    return AsyncAnthropic(api_key=get_settings().anthropic_api_key)
