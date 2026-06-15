"use client";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../components/ChatPanel";
import { PlanPreview } from "../components/PlanPreview";
import { ChatMessage, CoursePlan } from "../lib/types";
import {
  createSession, getSession, patchPlan, chatUrl, syllabusUrl, exportUrl,
} from "../lib/api";
import { readSSE } from "../lib/sse";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [streaming, setStreaming] = useState("");
  const [searches, setSearches] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planRef = useRef<CoursePlan | null>(null);
  planRef.current = plan;

  useEffect(() => {
    const existing = localStorage.getItem("sessionId");
    (async () => {
      if (existing) {
        const s = await getSession(existing);
        if (!s.error) {
          setSessionId(existing);
          setMessages(s.messages.map((m: any) => ({ role: m.role, content: m.content })));
          setPlan(s.plan);
          return;
        }
      }
      const created = await createSession();
      localStorage.setItem("sessionId", created.id);
      setSessionId(created.id);
      const s = await getSession(created.id);
      setPlan(s.plan);
    })();
  }, []);

  async function streamFrom(resp: Response) {
    setStreaming(""); setSearches([]); setError(null); setBusy(true);
    let acc = "";
    await readSSE(resp, (event, data) => {
      if (event === "token") { acc += data.text; setStreaming(acc); }
      else if (event === "sources") setSearches((p) => [...p, ...data.searches]);
      else if (event === "plan_update") setPlan(data.plan);
      else if (event === "error") setError(data.message);
    });
    if (acc.trim()) setMessages((m) => [...m, { role: "assistant", content: acc.trim() }]);
    setStreaming(""); setBusy(false);
  }

  async function onSend(text: string) {
    if (!sessionId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    const resp = await fetch(chatUrl(sessionId), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    await streamFrom(resp);
  }

  async function onImport(file: File) {
    if (!sessionId) return;
    const fd = new FormData(); fd.append("file", file);
    const resp = await fetch(syllabusUrl(sessionId), { method: "POST", body: fd });
    await streamFrom(resp);
  }

  async function onPlanChange(next: CoursePlan) {
    if (!sessionId) return;
    setPlan(next);
    await patchPlan(sessionId, next);
  }

  return (
    <main style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
      <section style={{ borderRight: "1px solid #e2e8f0", height: "100vh" }}>
        <ChatPanel messages={messages} streaming={streaming} searches={searches}
          busy={busy} error={error} onSend={onSend} />
      </section>
      <section style={{ height: "100vh" }}>
        {plan && (
          <PlanPreview plan={plan} onChange={onPlanChange}
            onExport={() => sessionId && window.open(exportUrl(sessionId), "_blank")}
            onImport={onImport} />
        )}
      </section>
    </main>
  );
}
