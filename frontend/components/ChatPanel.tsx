"use client";
import { useEffect, useRef, useState } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const submit = () => { const t = text.trim(); if (t && !busy) { onSend(t); setText(""); } };

  // keep the conversation pinned to the latest message
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, searches]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)" }}>
      <div style={{
        padding: "12px 16px", borderBottom: "1px solid var(--border)",
        fontWeight: 700, fontSize: 15, color: "var(--text)", boxShadow: "var(--shadow)",
      }}>
        💬 Chat
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {messages.length === 0 && !streaming && (
          <p style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
            👋 Tell me about the course you want to build — subject, who it&apos;s for,
            how long, and your goals.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "12px 0", display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <span style={{
              display: "inline-block", padding: "10px 14px", borderRadius: 14, maxWidth: "82%",
              fontSize: 14, lineHeight: 1.5,
              background: m.role === "user" ? "var(--user-bubble)" : "var(--assistant-bubble)",
              color: m.role === "user" ? "var(--user-bubble-text)" : "var(--assistant-bubble-text)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{m.content}</span>
          </div>
        ))}
        <SourceBadges searches={searches} />
        {streaming && (
          <div style={{ margin: "12px 0", display: "flex", justifyContent: "flex-start" }}>
            <span style={{
              display: "inline-block", padding: "10px 14px", borderRadius: 14, maxWidth: "82%",
              fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: "var(--assistant-bubble)", color: "var(--assistant-bubble-text)",
            }}>{streaming}<span style={{ opacity: 0.6 }}>▌</span></span>
          </div>
        )}
        {error && (
          <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>⚠ {error}</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder={busy ? "Thinking…" : "Message the assistant…"} disabled={busy}
          rows={2} style={{ flex: 1, resize: "none" }} />
        <button onClick={submit} disabled={busy || !text.trim()}>Send</button>
      </div>
    </div>
  );
}
