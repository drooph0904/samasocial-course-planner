"use client";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";
import { IChat, ISearch, ISend } from "./icons";

const SUGGESTIONS = [
  "Add a capstone rubric",
  "Make the last module harder",
  "Add a quiz per module",
  "Suggest prerequisite topics",
];

export function ChatPanel({
  messages, streaming, searches, busy, error, hasPlan, show = true, onSend,
}: {
  messages: ChatMessage[];
  streaming: string;
  searches: string[];
  busy: boolean;
  error: string | null;
  hasPlan: boolean;
  show?: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const submit = () => { const t = text.trim(); if (t && !busy) { onSend(t); setText(""); } };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming, searches]);

  return (
    <section className={`pane mid ${show ? "show" : ""}`}>
      <div className="pane-head"><h2><IChat /> Chat</h2></div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !streaming && (
          <p className="empty-hint">
            Tell me about the course you want to build — subject, who it&apos;s for,
            how long, and your goals.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "user" : "ai"}`}>
            {m.role === "user" ? m.content : renderMarkdown(m.content)}
          </div>
        ))}
        {searches.length > 0 && searches.map((s, i) => (
          <div key={`s${i}`} className="action-chip"><ISearch /> Searched · {s}</div>
        ))}
        {streaming && <div className="msg ai">{renderMarkdown(streaming)}<span style={{ opacity: 0.5 }}>▌</span></div>}
        {busy && !streaming && (
          <div className="msg ai typing" aria-label="Assistant is thinking">
            <span /><span /><span />
          </div>
        )}
        {error && <div className="chat-error">⚠ {error}</div>}
      </div>

      {hasPlan && !busy && (
        <div className="suggests">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggest" disabled={busy} onClick={() => onSend(s)}>＋ {s}</button>
          ))}
        </div>
      )}

      <div className="composer">
        <div className="wrap">
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={busy ? "Thinking…" : "Ask for a change, or describe a new course…"}
            disabled={busy} />
          <button className="send" aria-label="Send" onClick={submit} disabled={busy || !text.trim()}>
            <ISend />
          </button>
        </div>
      </div>
    </section>
  );
}
