export interface Project {
  id: string;
  name: string;
}

export interface ProjectState {
  projectId: string;
  goal: string;
  nextAction: string;
  active: string[];
  blocked: string[];
  openQuestions: string[];
  updatedAt?: string;
  freshUntil?: string;
  revision: string;
}

/** Omitted fields keep the stored value; empty arrays/strings clear it. */
export interface ProjectStatePatch {
  goal?: string;
  nextAction?: string;
  active?: string[];
  blocked?: string[];
  openQuestions?: string[];
  freshUntil?: string;
}

export type StateSaveResult = "saved" | "conflict" | "error";
