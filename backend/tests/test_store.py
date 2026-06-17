from app.services.store import Store

class FakeTable:
    def __init__(self, db, name): self.db, self.name = db, name; self._filter=None; self._payload=None; self._op=None
    def insert(self, payload): self._op=("insert", payload); return self
    def upsert(self, payload, **kw): self._op=("upsert", payload); return self
    def update(self, payload): self._op=("update", payload); return self
    def delete(self): self._op=("delete", None); return self
    def select(self, *_a): self._op=("select", None); return self
    def eq(self, col, val): self._filter=(col, val); return self
    def order(self, *_a, **_k): return self
    def single(self): self._single=True; return self
    def execute(self):
        op, payload = self._op
        rows = self.db.setdefault(self.name, [])
        if op == "insert":
            rows.append(payload); return type("R", (), {"data": [payload]})
        if op == "upsert":
            rows[:] = [r for r in rows if r.get("session_id") != payload.get("session_id")]
            rows.append(payload); return type("R", (), {"data": [payload]})
        if op == "update":
            col, val = self._filter
            updated = []
            for r in rows:
                if r.get(col) == val:
                    r.update(payload); updated.append(r)
            return type("R", (), {"data": updated})
        if op == "delete":
            col, val = self._filter
            kept = [r for r in rows if r.get(col) != val]
            removed = [r for r in rows if r.get(col) == val]
            rows[:] = kept
            return type("R", (), {"data": removed})
        if op == "select":
            if self._filter is None:
                return type("R", (), {"data": list(rows)})
            col, val = self._filter
            data = [r for r in rows if r.get(col) == val]
            return type("R", (), {"data": data})
        return type("R", (), {"data": []})

class FakeClient:
    def __init__(self): self.db = {}
    def table(self, name): return FakeTable(self.db, name)

def test_create_and_get_session():
    store = Store(FakeClient())
    sid = store.create_session("My course")
    assert isinstance(sid, str) and sid
    s = store.get_session(sid)
    assert s["title"] == "My course"

def test_messages_roundtrip():
    store = Store(FakeClient())
    sid = store.create_session("c")
    store.add_message(sid, "user", "hello")
    store.add_message(sid, "assistant", "hi there")
    msgs = store.get_messages(sid)
    assert [m["role"] for m in msgs] == ["user", "assistant"]

def test_plan_upsert_replaces():
    store = Store(FakeClient())
    sid = store.create_session("c")
    store.save_plan(sid, {"title": "v1"})
    store.save_plan(sid, {"title": "v2"})
    assert store.get_plan(sid)["title"] == "v2"

def test_list_sessions_returns_all():
    store = Store(FakeClient())
    store.create_session("A")
    store.create_session("B")
    titles = {s["title"] for s in store.list_sessions()}
    assert titles == {"A", "B"}

def test_update_session_title():
    store = Store(FakeClient())
    sid = store.create_session("New course")
    store.update_session_title(sid, "Intro to Python")
    assert store.get_session(sid)["title"] == "Intro to Python"

def test_delete_session_removes_it():
    store = Store(FakeClient())
    sid = store.create_session("Doomed")
    store.delete_session(sid)
    assert store.get_session(sid) is None
    assert store.list_sessions() == []
