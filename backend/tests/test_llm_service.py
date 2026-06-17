import asyncio
import json

from app.services.llm_service import build_tools, to_openai_messages, run_turn


# ---- tool defs + history conversion -----------------------------------------

def test_build_tools_has_web_search_and_update_plan():
    tools = build_tools()
    types = {t.get("type") for t in tools}
    assert "web_search" in types
    update = next(t for t in tools if t.get("name") == "update_course_plan")
    assert update["type"] == "function"
    assert update["strict"] is True
    assert update["parameters"]["type"] == "object"


def test_history_conversion_includes_current_plan():
    history = [
        {"role": "user", "content": "Plan a python course"},
        {"role": "assistant", "content": "Sure, what audience?"},
    ]
    msgs = to_openai_messages(history, current_plan={"title": "Py"})
    assert msgs[0]["role"] == "user"
    assert any("Py" in str(m["content"]) for m in msgs)


# ---- fake Responses API streaming -------------------------------------------

class Ev:
    def __init__(self, type, **kw):
        self.type = type
        self.__dict__.update(kw)


class Item:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class Resp:
    def __init__(self, id):
        self.id = id


class FakeStream:
    def __init__(self, events):
        self._events = events

    def __aiter__(self):
        async def gen():
            for e in self._events:
                yield e
        return gen()


class FakeResponses:
    def __init__(self, scripts):
        self._scripts = scripts
        self._i = 0
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        script = self._scripts[self._i]
        self._i += 1
        return FakeStream(script)


class FakeClient:
    def __init__(self, scripts):
        self.responses = FakeResponses(scripts)


def _full_plan():
    return {
        "title": "Py", "subject": "Python",
        "audience": {"age_group": "x", "skill_level": "x", "prior_knowledge": "x"},
        "schedule": {"duration": "x", "session_frequency": "x", "session_length": "x"},
        "learning_goals": [], "modules": [],
    }


def test_run_turn_streams_text_searches_and_saves_plan():
    plan = _full_plan()
    # Turn 1: a web search, streamed text, then a function call to update_course_plan
    script1 = [
        Ev("response.created", response=Resp("resp_1")),
        Ev("response.output_text.delta", delta="Here "),
        Ev("response.output_text.delta", delta="is your plan."),
        Ev("response.output_item.done",
           item=Item(type="web_search_call",
                     action=Item(type="search", query="python tutorials for teens"))),
        Ev("response.output_item.done",
           item=Item(type="function_call", name="update_course_plan",
                     arguments=json.dumps(plan), call_id="call_1")),
        Ev("response.completed", response=Resp("resp_1")),
    ]
    # Turn 2 (continuation after function output): wrap-up text, no more calls
    script2 = [
        Ev("response.created", response=Resp("resp_2")),
        Ev("response.output_text.delta", delta="All set!"),
        Ev("response.completed", response=Resp("resp_2")),
    ]
    client = FakeClient([script1, script2])

    saved = {}

    async def save(p):
        saved["plan"] = p

    async def collect():
        out = []
        async for ev in run_turn(client, "gpt-5.4",
                                 [{"role": "user", "content": "plan"}], None, save):
            out.append(ev)
        return out

    events = asyncio.run(collect())
    names = [e[0] for e in events]

    assert "token" in names
    assert "sources" in names
    assert "plan_update" in names
    assert names[-1] == "done"
    assert saved["plan"]["title"] == "Py"

    # continuation chained by previous_response_id and fed the function output back
    second_call = client.responses.calls[1]
    assert second_call["previous_response_id"] == "resp_1"
    assert second_call["input"][0]["type"] == "function_call_output"
    assert second_call["input"][0]["call_id"] == "call_1"
