"use client";
import { CoursePlan, Difficulty } from "../lib/types";
import { EditableField } from "./EditableField";

const DIFF_COLOR: Record<Difficulty, string> = {
  beginner: "#dcfce7", intermediate: "#fef9c3", advanced: "#fee2e2",
};

export function PlanPreview({
  plan, onChange, onExport, onImport,
}: {
  plan: CoursePlan;
  onChange: (p: CoursePlan) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  // helper: immutably set a deep value then bubble up
  const set = (mutate: (draft: CoursePlan) => void) => {
    const copy: CoursePlan = JSON.parse(JSON.stringify(plan));
    mutate(copy); onChange(copy);
  };

  const empty = !plan.title && plan.modules.length === 0;

  return (
    <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>
          <EditableField value={plan.title} placeholder="Course title"
            onSave={(v) => set((d) => { d.title = v; })} />
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <label style={{ fontSize: 13, cursor: "pointer", border: "1px solid #cbd5e1", borderRadius: 6, padding: "4px 8px" }}>
            Import PDF
            <input type="file" accept="application/pdf" hidden
              onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
          <button onClick={onExport}>Export JSON</button>
        </div>
      </div>

      {empty && <p style={{ color: "#94a3b8" }}>Your course plan will appear here as you chat. ➜</p>}

      {!empty && (
        <>
          <p><strong>Subject:</strong>{" "}
            <EditableField value={plan.subject} onSave={(v) => set((d) => { d.subject = v; })} /></p>
          <p style={{ fontSize: 13, color: "#475569" }}>
            👥 {plan.audience.age_group} · {plan.audience.skill_level} · prior: {plan.audience.prior_knowledge}<br />
            🗓 {plan.schedule.duration} · {plan.schedule.session_frequency} · {plan.schedule.session_length}
          </p>

          {plan.learning_goals.length > 0 && (
            <>
              <h4>Learning goals</h4>
              <ul>{plan.learning_goals.map((g, i) => (
                <li key={i}><EditableField value={g}
                  onSave={(v) => set((d) => { d.learning_goals[i] = v; })} /></li>
              ))}</ul>
            </>
          )}

          {plan.modules.map((m, mi) => (
            <div key={mi} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, margin: "12px 0" }}>
              <h3 style={{ marginTop: 0 }}>
                Module {mi + 1}:{" "}
                <EditableField value={m.title} onSave={(v) => set((d) => { d.modules[mi].title = v; })} />
              </h3>

              {m.prerequisites.length > 0 && (
                <p style={{ fontSize: 13 }}><strong>Prerequisites:</strong> {m.prerequisites.join(", ")}</p>
              )}

              <strong>Objectives</strong>
              <ul>{m.objectives.map((o, oi) => (
                <li key={oi}><EditableField value={o}
                  onSave={(v) => set((d) => { d.modules[mi].objectives[oi] = v; })} /></li>
              ))}</ul>

              {m.lessons.map((l, li) => (
                <div key={li} style={{ borderLeft: "3px solid #e2e8f0", paddingLeft: 10, margin: "8px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <EditableField value={l.title} onSave={(v) => set((d) => { d.modules[mi].lessons[li].title = v; })} />
                    <span style={{ fontSize: 11, background: DIFF_COLOR[l.difficulty], borderRadius: 10, padding: "1px 8px" }}>
                      {l.difficulty}
                    </span>
                  </div>
                  {l.topics.length > 0 && <div style={{ fontSize: 13, color: "#475569" }}>{l.topics.join(" · ")}</div>}
                  {l.resources.length > 0 && (
                    <ul style={{ fontSize: 13 }}>
                      {l.resources.map((r, ri) => (
                        <li key={ri}>
                          <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>{" "}
                          <span style={{ color: "#94a3b8" }}>({r.type} · {r.source})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {m.assessment && <p style={{ fontSize: 13 }}>📝 <strong>Assessment:</strong> {m.assessment}</p>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
