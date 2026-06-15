from app.services.claude_service import build_tools, to_anthropic_messages

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
