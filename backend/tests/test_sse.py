from app.sse import sse_event

def test_sse_event_formats_named_json_event():
    out = sse_event("token", {"text": "hi"})
    assert out == 'event: token\ndata: {"text": "hi"}\n\n'

def test_sse_event_compact_json():
    out = sse_event("plan_update", {"plan": {"title": "x"}})
    assert out == 'event: plan_update\ndata: {"plan": {"title": "x"}}\n\n'
