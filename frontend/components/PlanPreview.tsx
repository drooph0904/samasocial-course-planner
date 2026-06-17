"use client";
import { CoursePlan, Difficulty } from "../lib/types";
import { EditableField } from "./EditableField";

const DIFF_BG: Record<Difficulty, string> = {
  beginner: "var(--diff-beginner-bg)",
  intermediate: "var(--diff-intermediate-bg)",
  advanced: "var(--diff-advanced-bg)",
};

export function PlanPreview({
  plan, onChange, onExport, onImport,
}: {
  plan: CoursePlan;
  onChange: (p: CoursePlan) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const set = (mutate: (draft: CoursePlan) => void) => {
    const copy: CoursePlan = JSON.parse(JSON.stringify(plan));
    mutate(copy); onChange(copy);
  };

  const empty = !plan.title && plan.modules.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-panel)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8,
        padding: "12px 16px", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow)",
      }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>📋 Course preview</span>
        <div style={{ display: "flex", gap: 8 }}>
          <label className="ghost" style={{
            fontSize: 13, cursor: "pointer", border: "1px solid var(--border)", borderRadius: 8,
            padding: "7px 12px", color: "var(--text-muted)", fontWeight: 600,
          }}>
            Import PDF
            <input type="file" accept="application/pdf" hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
          <button onClick={onExport} style={{ fontSize: 13 }}>Export JSON</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, color: "var(--text)" }}>
        {empty && (
          <p style={{ color: "var(--text-faint)", lineHeight: 1.6 }}>
            Your course plan will appear here as you chat. ⬅
          </p>
        )}

        {!empty && (
          <>
            <h2 style={{ margin: "0 0 6px" }}>
              <EditableField value={plan.title} placeholder="Course title"
                onSave={(v) => set((d) => { d.title = v; })} />
            </h2>
            <p style={{ margin: "0 0 4px" }}><strong>Subject:</strong>{" "}
              <EditableField value={plan.subject} onSave={(v) => set((d) => { d.subject = v; })} /></p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7 }}>
              👥 {plan.audience.age_group} · {plan.audience.skill_level} · prior: {plan.audience.prior_knowledge}<br />
              🗓 {plan.schedule.duration} · {plan.schedule.session_frequency} · {plan.schedule.session_length}
            </p>

            {plan.learning_goals.length > 0 && (
              <>
                <h4 style={{ margin: "16px 0 6px" }}>Learning goals</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>{plan.learning_goals.map((g, i) => (
                  <li key={i} style={{ marginBottom: 3 }}><EditableField value={g}
                    onSave={(v) => set((d) => { d.learning_goals[i] = v; })} /></li>
                ))}</ul>
              </>
            )}

            {plan.modules.map((m, mi) => (
              <div key={mi} style={{
                border: "1px solid var(--border)", borderRadius: 10, padding: 14, margin: "14px 0",
                background: "var(--bg-elevated)",
              }}>
                <h3 style={{ marginTop: 0, marginBottom: 8 }}>
                  Module {mi + 1}:{" "}
                  <EditableField value={m.title} onSave={(v) => set((d) => { d.modules[mi].title = v; })} />
                </h3>

                {m.prerequisites.length > 0 && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                    <strong>Prerequisites:</strong> {m.prerequisites.join(", ")}
                  </p>
                )}

                <strong style={{ fontSize: 14 }}>Objectives</strong>
                <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>{m.objectives.map((o, oi) => (
                  <li key={oi} style={{ marginBottom: 2 }}><EditableField value={o}
                    onSave={(v) => set((d) => { d.modules[mi].objectives[oi] = v; })} /></li>
                ))}</ul>

                {m.lessons.map((l, li) => (
                  <div key={li} style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 12, margin: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <EditableField value={l.title} onSave={(v) => set((d) => { d.modules[mi].lessons[li].title = v; })} />
                      <span style={{
                        fontSize: 11, fontWeight: 600, background: DIFF_BG[l.difficulty],
                        color: "var(--diff-text)", borderRadius: 10, padding: "2px 9px",
                      }}>{l.difficulty}</span>
                    </div>
                    {l.topics.length > 0 && (
                      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{l.topics.join(" · ")}</div>
                    )}
                    {l.resources.length > 0 && (
                      <ul style={{ fontSize: 13, margin: "4px 0", paddingLeft: 20 }}>
                        {l.resources.map((r, ri) => (
                          <li key={ri} style={{ marginBottom: 2 }}>
                            <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{" "}
                            <span style={{ color: "var(--text-faint)" }}>({r.type} · {r.source})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {m.assessment && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>📝 <strong>Assessment:</strong> {m.assessment}</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
