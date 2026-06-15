from app.services.claude_service import build_tools, to_anthropic_messages
import asyncio
from app.services.claude_service import run_turn

class FakeBlock:
    def __init__(self, **kw): self.__dict__.update(kw)

class FakeFinalMessage:
    def __init__(self, stop_reason, content): self.stop_reason=stop_reason; self.content=content

class FakeStream:
    """Mimics client.messages.stream(...) context manager + async text iterator."""
    def __init__(self, text_chunks, final): self._chunks=text_chunks; self._final=final
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return False
    @property
    def text_stream(self):
        async def gen():
            for c in self._chunks:
                yield c
        return gen()
    async def get_final_message(self): return self._final

class FakeMessages:
    def __init__(self, scripted): self._scripted=scripted; self._i=0
    def stream(self, **kw):
        s = self._scripted[self._i]; self._i+=1; return s

class FakeClient:
    def __init__(self, scripted): self.messages=FakeMessages(scripted)

def test_run_turn_streams_text_and_saves_plan():
    plan = {"title": "Py", "subject": "Python", "audience": {"age_group":"x","skill_level":"x","prior_knowledge":"x"},
            "schedule": {"duration":"x","session_frequency":"x","session_length":"x"},
            "learning_goals": [], "modules": []}
    # Turn 1: assistant emits text then a tool_use for update_course_plan -> stop_reason tool_use
    tool_block = FakeBlock(type="tool_use", name="update_course_plan", id="toolu_1", input=plan)
    text_block = FakeBlock(type="text", text="Here is your plan.")
    stream1 = FakeStream(["Here ", "is your plan."],
                         FakeFinalMessage("tool_use", [text_block, tool_block]))
    # Turn 2: after tool result, assistant wraps up -> end_turn
    stream2 = FakeStream(["All set!"], FakeFinalMessage("end_turn", [FakeBlock(type="text", text="All set!")]))
    client = FakeClient([stream1, stream2])

    saved = {}
    async def save(p): saved["plan"] = p

    async def collect():
        out = []
        async for ev in run_turn(client, "claude-x", [{"role":"user","content":"plan"}], None, save):
            out.append(ev)
        return out

    events = asyncio.run(collect())
    names = [e[0] for e in events]
    assert "token" in names
    assert "plan_update" in names
    assert names[-1] == "done"
    assert saved["plan"]["title"] == "Py"

def test_build_tools_has_web_search_and_update_plan():
    tools = build_tools()
    names_types = {(t.get("name"), t.get("type")) for t in tools}
    assert ("web_search", "web_search_20260209") in names_types
    update = next(t for t in tools if t.get("name") == "update_course_plan")
    assert update["strict"] is True
    assert update["input_schema"]["type"] == "object"

def test_history_conversion_includes_current_plan():
    history = [
        {"role": "user", "content": "Plan a python course"},
        {"role": "assistant", "content": "Sure, what audience?"},
    ]
    msgs = to_anthropic_messages(history, current_plan={"title": "Py"})
    assert msgs[0]["role"] == "user"
    # current plan is appended as context on the latest user turn or a trailing note
    assert any("Py" in str(m["content"]) for m in msgs)
