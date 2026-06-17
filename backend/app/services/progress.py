"""Preserve user completion across AI regeneration.

When the assistant regenerates a plan it replaces the whole object and its
lessons carry no `done` flag. We carry forward completion from the previous
plan by matching lessons on (module index, lesson title) so checking off
work survives content edits. Renamed lessons reset to not-done (acceptable)."""


def merge_completion(old_plan: dict | None, new_plan: dict) -> dict:
    if not old_plan:
        return new_plan
    old_modules = old_plan.get("modules") or []
    for mi, module in enumerate(new_plan.get("modules") or []):
        if mi >= len(old_modules):
            break
        done_titles = {
            (l.get("title") or "")
            for l in (old_modules[mi].get("lessons") or [])
            if l.get("done")
        }
        for lesson in module.get("lessons") or []:
            if (lesson.get("title") or "") in done_titles:
                lesson["done"] = True
    return new_plan
