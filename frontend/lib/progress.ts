import { CoursePlan, Module } from "./types";

export function emptyPlan(): CoursePlan {
  return {
    title: "", subject: "",
    audience: { age_group: "", skill_level: "", prior_knowledge: "" },
    schedule: { duration: "", session_frequency: "", session_length: "" },
    learning_goals: [], modules: [],
  };
}

export function moduleStats(m: Module) {
  const total = m.lessons.length;
  const done = m.lessons.filter((l) => l.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct, complete: total > 0 && done === total, started: done > 0 };
}

export function courseStats(plan: CoursePlan) {
  let total = 0, done = 0;
  for (const m of plan.modules) { total += m.lessons.length; done += m.lessons.filter((l) => l.done).length; }
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct, remaining: total - done };
}

/** The first not-done lesson across the course, as "mi-li", or null if all done/empty. */
export function nextUpKey(plan: CoursePlan): string | null {
  for (let mi = 0; mi < plan.modules.length; mi++) {
    const ls = plan.modules[mi].lessons;
    for (let li = 0; li < ls.length; li++) if (!ls[li].done) return `${mi}-${li}`;
  }
  return null;
}

/** 1-based label of the module the learner is currently on (first not-complete). */
export function currentModule(plan: CoursePlan): { index: number; title: string } | null {
  for (let mi = 0; mi < plan.modules.length; mi++) {
    if (!moduleStats(plan.modules[mi]).complete) {
      return { index: mi + 1, title: plan.modules[mi].title };
    }
  }
  return null;
}
