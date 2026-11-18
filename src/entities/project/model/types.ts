import type { Provenance, TrustLevel } from "@/entities/memory/model/types";

export interface Project {
  id: string;
  name: string;
  paths: string[];
  pathProvenance: Record<string, string>;
}

export const PATH_OWNERSHIP_STATES = ["owned", "stamped", "missing"] as const;
export type PathOwnershipState = (typeof PATH_OWNERSHIP_STATES)[number];

export interface PathOwnership {
  path: string;
  machine?: string;
  state: PathOwnershipState;
}

export interface ProjectOwnership {
  projectId: string;
  paths: PathOwnership[];
}

/** Dry-run or applied path-provenance adoption report. */
export interface AdoptReport {
  machine: string;
  applied: boolean;
  stamped: number;
  owned: number;
  missing: number;
  projects: ProjectOwnership[];
}

export interface StateReviewRequest {
  reviewed?: boolean;
  trust?: TrustLevel;
  expectedRevision?: string;
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
  provenance: Provenance;
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
