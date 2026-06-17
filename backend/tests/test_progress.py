from app.services.progress import merge_completion


def _plan(lessons_by_module):
    return {"modules": [
        {"lessons": [{"title": t, "done": d} for (t, d) in lessons]}
        for lessons in lessons_by_module
    ]}


def test_merge_carries_done_by_title():
    old = _plan([[("Intro", True), ("Setup", False)]])
    new = _plan([[("Intro", False), ("Setup", False), ("Extra", False)]])
    out = merge_completion(old, new)
    titles = {l["title"]: l["done"] for l in out["modules"][0]["lessons"]}
    assert titles == {"Intro": True, "Setup": False, "Extra": False}


def test_renamed_lesson_resets():
    old = _plan([[("Old name", True)]])
    new = _plan([[("New name", False)]])
    out = merge_completion(old, new)
    assert out["modules"][0]["lessons"][0]["done"] is False


def test_no_old_plan_is_noop():
    new = _plan([[("A", False)]])
    assert merge_completion(None, new) == new


def test_handles_extra_new_module():
    old = _plan([[("A", True)]])
    new = _plan([[("A", False)], [("B", False)]])
    out = merge_completion(old, new)
    assert out["modules"][0]["lessons"][0]["done"] is True
    assert out["modules"][1]["lessons"][0]["done"] is False
