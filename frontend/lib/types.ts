export type Difficulty = "beginner" | "intermediate" | "advanced";
export type ResourceType = "youtube" | "blog" | "docs" | "exercise";

export interface Resource { title: string; url: string; type: ResourceType; source: string; }
export interface Lesson { title: string; topics: string[]; difficulty: Difficulty; resources: Resource[]; done?: boolean; }
export interface Module { title: string; objectives: string[]; prerequisites: string[]; assessment: string; lessons: Lesson[]; }
export interface CoursePlan {
  title: string; subject: string;
  audience: { age_group: string; skill_level: string; prior_knowledge: string };
  schedule: { duration: string; session_frequency: string; session_length: string };
  learning_goals: string[];
  modules: Module[];
}
export interface ChatMessage { role: "user" | "assistant"; content: string; }
export interface SessionSummary { id: string; title: string; created_at?: string; }
export type Theme = "dark" | "light";
