"use client";
import { useState } from "react";
import { ChatMessage } from "../lib/types";
import { SourceBadges } from "./SourceBadges";

export function ChatPanel({
  messages, streaming, searches, busy, error, onSend,
}: {
  messages: ChatMessage[];
  streaming: string;
  searches: string[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => { const t = text.trim(); if (t && !busy) { onSend(t); setText(""); } };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.length === 0 && (
          <p style={{ color: "#94a3b8" }}>
            👋 Tell me about the course you want to build — subject, who it's for,
            how long, and your goals.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "10px 0", textAlign: m.role === "user" ? "right" : "left" }}>
            <span style={{
              display: "inline-block", padding: "8px 12px", borderRadius: 10, maxWidth: "80%",
              background: m.role === "user" ? "#3730a3" : "#f1f5f9",
              color: m.role === "user" ? "white" : "#0f172a", whiteSpace: "pre-wrap",
            }}>{m.content}</span>
          </div>
        ))}
        <SourceBadges searches={searches} />
        {streaming && (
          <div style={{ margin: "10px 0" }}>
            <span style={{ display: "inline-block", padding: "8px 12px", borderRadius: 10,
              background: "#f1f5f9", whiteSpace: "pre-wrap" }}>{streaming}▌</span>
          </div>
        )}
        {error && <p style={{ color: "#dc2626" }}>⚠ {error}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #e2e8f0" }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={busy ? "Thinking…" : "Message the assistant…"} disabled={busy}
          rows={2} style={{ flex: 1, resize: "none" }} />
        <button onClick={submit} disabled={busy}>Send</button>
      </div>
    </div>
  );
}
