"use client";
import React, { memo, useState } from "react";
import { CoursePlan, Lesson, Module, Resource } from "../lib/types";
import { EditableField } from "./EditableField";
import { moduleStats, courseStats, nextUpKey, currentModule } from "../lib/progress";
import { IUsers, ICalendar, ILayers, IClipboard, IUpload, IDownload, ITrash, ILink } from "./icons";

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
);

function newLesson(): Lesson {
  return { title: "New lesson", topics: [], difficulty: "beginner", resources: [], done: false };
}
function newModule(n: number): Module {
  return { title: `Module ${n}`, objectives: [], prerequisites: [], assessment: "", lessons: [newLesson()] };
}
function newResource(): Resource {
  return { title: "New resource", url: "https://", type: "docs", source: "" };
}

export const PlanPreview = memo(function PlanPreview({
  plan, onChange, onExport, onImport, show = true,
}: {
  plan: CoursePlan;
  onChange: (p: CoursePlan) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  show?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const set = (mutate: (d: CoursePlan) => void) => {
    const copy: CoursePlan = JSON.parse(JSON.stringify(plan));
    mutate(copy); onChange(copy);
  };
  const toggleCollapse = (mi: number) =>
    setCollapsed((prev) => { const n = new Set(prev); if (n.has(mi)) n.delete(mi); else n.add(mi); return n; });
  const allCollapsed = plan.modules.length > 0 && collapsed.size === plan.modules.length;
  const toggleAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(plan.modules.map((_, i) => i)));

  const stats = courseStats(plan);
  const nextKey = nextUpKey(plan);
  const cur = currentModule(plan);
  const empty = !plan.title && plan.modules.length === 0;

  return (
    <section className={`pane right ${show ? "show" : ""}`}>
      <div className="scroll">
        <div className="curr-header">
          <div className="imp-exp">
            <label className="icon-btn bordered" style={{ cursor: "pointer" }}>
              <IUpload /> Import
              <input type="file" accept="application/pdf" hidden
                onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
            </label>
            <button className="icon-btn bordered" onClick={onExport}><IDownload /> Export</button>
          </div>

          {empty ? (
            <>
              <h1 className="curr-title">Untitled course</h1>
              <p className="empty-curr">Your curriculum will appear here as you chat with the assistant. ⬅</p>
            </>
          ) : (
            <>
              <h1 className="curr-title">
                <EditableField value={plan.title} placeholder="Course title"
                  onSave={(v) => set((d) => { d.title = v; })} />
              </h1>
              <div className="subject-row">
                <span className="lbl">Subject</span>
                <span className="val">
                  <EditableField value={plan.subject} placeholder="subject"
                    onSave={(v) => set((d) => { d.subject = v; })} />
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-pill"><IUsers /> {plan.audience.age_group || "—"} · {plan.audience.skill_level || "—"}</span>
                <span className="meta-pill"><ICalendar /> <span className="mono">{plan.schedule.duration || "—"}</span> · {plan.schedule.session_frequency || "—"} · <span className="mono">{plan.schedule.session_length || "—"}</span></span>
                <span className="meta-pill"><ILayers /> <span className="mono">{plan.modules.length}</span> modules · <span className="mono">{stats.total}</span> lessons</span>
              </div>

              {stats.total > 0 && <div className="progress-block">
                <div className="ring" style={{ "--p": stats.pct } as React.CSSProperties}>
                  <div className="inner">{stats.pct}%</div>
                </div>
                <div className="progress-meta">
                  <div className="h">{cur ? `You're on Module ${cur.index} — ${cur.title}` : (stats.total ? "Course complete" : "No lessons yet")}</div>
                  <div className="s">{stats.done} of {stats.total} lessons done · {stats.remaining} remaining</div>
                </div>
                <div className="progress-stats">
                  <div className="pstat"><div className="n">{stats.done}</div><div className="l">Done</div></div>
                  <div className="pstat"><div className="n">{stats.remaining}</div><div className="l">Remaining</div></div>
                </div>
              </div>}
            </>
          )}
        </div>

        {!empty && (
          <div className="tabpanel">
            {/* learning goals */}
            <div className="goals">
              <div className="section-eyebrow">Learning goals</div>
              <div className="goal-list">
                {plan.learning_goals.map((g, i) => (
                  <div className="goal" key={i}>
                    <span className="dot" />
                    <span style={{ flex: 1 }}>
                      <EditableField value={g} onSave={(v) => set((d) => { d.learning_goals[i] = v; })} />
                    </span>
                    <span className="del-inline" title="Remove goal"
                      onClick={() => set((d) => { d.learning_goals.splice(i, 1); })}>✕</span>
                  </div>
                ))}
              </div>
              <span className="add-inline" onClick={() => set((d) => { d.learning_goals.push("New goal"); })}>＋ Add goal</span>
            </div>

            {/* modules spine */}
            <div className="section-eyebrow">
              Modules
              {plan.modules.length > 0 && (
                <span className="act" onClick={toggleAll}>⇕ {allCollapsed ? "expand all" : "collapse all"}</span>
              )}
            </div>

            <div className="spine">
              {plan.modules.map((m, mi) => {
                const ms = moduleStats(m);
                const isCollapsed = collapsed.has(mi);
                const barColor = ms.complete ? "var(--done)" : ms.started ? "var(--prog)" : "var(--accent)";
                return (
                  <div key={mi} className={`module ${ms.complete ? "done" : ms.started ? "active" : ""} ${isCollapsed ? "collapsed" : ""}`}>
                    <div className="node">{ms.complete ? "✓" : mi + 1}</div>
                    <div className="mcard">
                      <div className="mhead" onClick={() => toggleCollapse(mi)}>
                        <div className="mt">
                          <div className="num">Module {mi + 1}{ms.started && !ms.complete ? " · in progress" : ""}</div>
                          <div className="name" onClick={(e) => e.stopPropagation()}>
                            <EditableField value={m.title} onSave={(v) => set((d) => { d.modules[mi].title = v; })} />
                          </div>
                        </div>
                        <div className="mbar"><div className="bar"><i style={{ width: `${ms.pct}%`, background: barColor }} /></div></div>
                        <span className="mdel" title="Delete module"
                          onClick={(e) => { e.stopPropagation(); if (confirm("Delete this module?")) set((d) => { d.modules.splice(mi, 1); }); }}><ITrash /></span>
                        <span className="caret">▾</span>
                      </div>

                      <div className="mbody">
                        <div className="prereq">
                          <b>Prerequisites:</b>{" "}
                          <EditableField value={m.prerequisites.join(", ")} placeholder="none"
                            onSave={(v) => set((d) => { d.modules[mi].prerequisites = v.split(",").map((s) => s.trim()).filter(Boolean); })} />
                        </div>

                        {m.objectives.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div className="section-eyebrow" style={{ marginBottom: 6 }}>Objectives</div>
                            <div className="goal-list">
                              {m.objectives.map((o, oi) => (
                                <div className="goal" key={oi}>
                                  <span className="dot" />
                                  <span style={{ flex: 1 }}>
                                    <EditableField value={o} onSave={(v) => set((d) => { d.modules[mi].objectives[oi] = v; })} />
                                  </span>
                                  <span className="del-inline" onClick={() => set((d) => { d.modules[mi].objectives.splice(oi, 1); })}>✕</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.lessons.map((l, li) => {
                          const key = `${mi}-${li}`;
                          const statusCls = l.done ? "done" : key === nextKey ? "prog" : "idle";
                          const statusTxt = l.done ? "Done" : key === nextKey ? "Next up" : "Not started";
                          return (
                            <div key={li} className={`lesson ${l.done ? "done" : ""}`}>
                              <button className="check" aria-label="Toggle complete"
                                onClick={() => set((d) => { d.modules[mi].lessons[li].done = !d.modules[mi].lessons[li].done; })}>
                                <Check />
                              </button>
                              <div className="lmain">
                                <div className="ltitle-row">
                                  <span className="ltitle">
                                    <EditableField value={l.title} onSave={(v) => set((d) => { d.modules[mi].lessons[li].title = v; })} />
                                  </span>
                                  <span className="ldel" title="Delete lesson"
                                    onClick={() => set((d) => { d.modules[mi].lessons.splice(li, 1); })}><ITrash /></span>
                                </div>
                                <div className="lstatus"><span className={`status ${statusCls}`}>{statusTxt}</span></div>
                                <div className="ltopics">
                                  <EditableField value={l.topics.join(" · ")} placeholder="add topics"
                                    onSave={(v) => set((d) => { d.modules[mi].lessons[li].topics = v.split("·").map((s) => s.trim()).filter(Boolean); })} />
                                </div>
                                <div className="lresources">
                                  {l.resources.map((r, ri) => {
                                    const valid = !!r.url && r.url !== "https://";
                                    return (
                                      <div key={ri} className="res-item">
                                        <ILink />
                                        <span className="res-title">
                                          <EditableField value={r.title} placeholder="title"
                                            onSave={(v) => set((d) => { d.modules[mi].lessons[li].resources[ri].title = v; })} />
                                        </span>
                                        <span className="res-url mono">
                                          <EditableField value={r.url} placeholder="https://…"
                                            onSave={(v) => set((d) => {
                                              d.modules[mi].lessons[li].resources[ri].url = v;
                                              try { d.modules[mi].lessons[li].resources[ri].source = new URL(v).hostname.replace(/^www\./, ""); } catch {}
                                            })} />
                                        </span>
                                        {valid && <a className="res-open" href={r.url} target="_blank" rel="noreferrer" title="Open link">↗</a>}
                                        <span className="del-inline" title="Remove resource"
                                          onClick={() => set((d) => { d.modules[mi].lessons[li].resources.splice(ri, 1); })}>✕</span>
                                      </div>
                                    );
                                  })}
                                  <span className="add-inline" style={{ marginTop: l.resources.length ? 6 : 0 }}
                                    onClick={() => set((d) => { d.modules[mi].lessons[li].resources.push(newResource()); })}>＋ Add resource</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        <div className="lesson-add" onClick={() => set((d) => { d.modules[mi].lessons.push(newLesson()); })}>
                          ＋ Add lesson
                        </div>

                        <div className="assessment">
                          <IClipboard />
                          <div><b>Assessment:</b>{" "}
                            <EditableField value={m.assessment} placeholder="add an assessment"
                              onSave={(v) => set((d) => { d.modules[mi].assessment = v; })} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <span className="add-inline" onClick={() => set((d) => { d.modules.push(newModule(d.modules.length + 1)); })}>
              ＋ Add module
            </span>
          </div>
        )}
      </div>
    </section>
  );
});
