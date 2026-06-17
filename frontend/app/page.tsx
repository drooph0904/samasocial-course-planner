"use client";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { PlanPreview } from "../components/PlanPreview";
import { Sidebar } from "../components/Sidebar";
import { ChatMessage, CoursePlan, SessionSummary } from "../lib/types";
import {
  createSession, getSession, listSessions, deleteSession,
  patchPlan, chatUrl, syllabusUrl, exportUrl,
} from "../lib/api";
import { readSSE } from "../lib/sse";

export default function Home() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [streaming, setStreaming] = useState("");
  const [searches, setSearches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // ---- session loading -------------------------------------------------------

  async function loadSession(id: string) {
    setActiveId(id);
    localStorage.setItem("activeSessionId", id);
    setStreaming(""); setSearches([]); setError(null);
    const s = await getSession(id);
    if (s.error) return;
    setMessages(s.messages.map((m: any) => ({ role: m.role, content: m.content })));
    setPlan(s.plan);
  }

  async function refreshSessions(): Promise<SessionSummary[]> {
    const list = await listSessions();
    setSessions(list);
    return list;
  }

  useEffect(() => {
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        const saved = localStorage.getItem("activeSessionId");
        const pick = list.find((s) => s.id === saved) ?? list[0];
        await loadSession(pick.id);
      } else {
        await newCourse();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- session actions -------------------------------------------------------

  async function newCourse() {
    const created = await createSession();
    setSessions((prev) => [{ id: created.id, title: created.title }, ...prev]);
    setMessages([]);
    await loadSession(created.id);
  }

  async function deleteCourse(id: string) {
    if (!window.confirm("Delete this course? This removes its chat and plan permanently.")) return;
    await deleteSession(id);
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (id === activeId) {
      if (remaining.length > 0) await loadSession(remaining[0].id);
      else await newCourse();
    }
  }

  // ---- streaming -------------------------------------------------------------

  async function streamFrom(resp: Response) {
    setStreaming(""); setSearches([]); setError(null); setBusy(true);
    let acc = "";
    await readSSE(resp, (event, data) => {
      if (event === "token") { acc += data.text; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...data.searches]);
      else if (event === "plan_update") {
        setPlan(data.plan);
        const title = (data.plan?.title ?? "").trim();
        if (title) {
          const id = activeIdRef.current;
          setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
        }
      }
      else if (event === "error") setError(data.message);
    });
    if (acc.trim()) setMessages((m) => [...m, { role: "assistant", content: acc.trim() }]);
    setStreaming(""); setBusy(false);
  }

  async function onSend(text: string) {
    if (!activeId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    const resp = await fetch(chatUrl(activeId), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    await streamFrom(resp);
  }

  async function onImport(file: File) {
    if (!activeId) return;
    const fd = new FormData(); fd.append("file", file);
    const resp = await fetch(syllabusUrl(activeId), { method: "POST", body: fd });
    await streamFrom(resp);
  }

  async function onPlanChange(next: CoursePlan) {
    if (!activeId) return;
    setPlan(next);
    await patchPlan(activeId, next);
  }

  // ---- layout ----------------------------------------------------------------

  return (
    <main style={{ display: "grid", gridTemplateColumns: "260px 1fr 1fr", height: "100vh" }}>
      <aside style={{ height: "100vh", overflow: "hidden" }}>
        <Sidebar
          sessions={sessions} activeId={activeId}
          onSelect={(id) => id !== activeId && loadSession(id)}
          onNew={newCourse} onDelete={deleteCourse}
        />
      </aside>
      <section style={{ borderRight: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0", height: "100vh" }}>
        <ChatPanel messages={messages} streaming={streaming} searches={searches}
          busy={busy} error={error} onSend={onSend} />
      </section>
      <section style={{ height: "100vh" }}>
        {plan && (
          <PlanPreview plan={plan} onChange={onPlanChange}
            onExport={() => activeId && window.open(exportUrl(activeId), "_blank")}
            onImport={onImport} />
        )}
      </section>
    </main>
  );
}
