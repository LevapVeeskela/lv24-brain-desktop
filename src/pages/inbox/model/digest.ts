import { parseProject } from "@/entities/project/api/projectApi";
import type { Project } from "@/entities/project/model/types";
import {
  asArray,
  asBoolean,
  asNumber,
  asObject,
  asOptionalString,
  asString,
  asTimestamp,
} from "@/shared/api/validate";

export interface DigestDecision {
  id: string;
  title: string;
}

export interface DigestHandoff {
  id: string;
  summary: string;
  nextAction?: string;
  createdAt: string;
}

export interface DigestProject {
  project: Project;
  changes: number;
  notes: number;
  decisions: number;
  attempts: number;
  handoffs: number;
  commits: number;
  latestHandoff?: DigestHandoff;
  proposedDecisions: DigestDecision[];
  openQuestions: string[];
  blocked: string[];
  findings?: Record<string, number>;
}

/** Morning digest; dryRun=true means nothing was written. */
export interface Digest {
  generatedAt: string;
  since: string;
  dryRun: boolean;
  writtenTo?: string;
  projects: DigestProject[];
}

export function parseDigest(value: unknown): Digest {
  const digest = asObject(value, "digest");
  return {
    generatedAt: asTimestamp(digest.generated_at, "digest.generated_at"),
    since: asTimestamp(digest.since, "digest.since"),
    dryRun: asBoolean(digest.dry_run, "digest.dry_run"),
    writtenTo: asOptionalString(digest.written_to, "digest.written_to"),
    projects: asArray(
      digest.projects,
      "digest.projects",
      parseDigestProject,
    ),
  };
}

function parseDigestProject(value: unknown, what: string): DigestProject {
  const project = asObject(value, what);
  const handoff = project.latest_handoff;
  return {
    project: parseProject(project.project, `${what}.project`),
    changes: asNumber(project.changes, `${what}.changes`),
    notes: asNumber(project.notes, `${what}.notes`),
    decisions: asNumber(project.decisions, `${what}.decisions`),
    attempts: asNumber(project.attempts, `${what}.attempts`),
    handoffs: asNumber(project.handoffs, `${what}.handoffs`),
    commits: asNumber(project.commits, `${what}.commits`),
    latestHandoff:
      handoff === undefined || handoff === null
        ? undefined
        : parseDigestHandoff(handoff, `${what}.latest_handoff`),
    proposedDecisions: asArray(
      project.proposed_decisions,
      `${what}.proposed_decisions`,
      parseDigestDecision,
    ),
    openQuestions: asArray(
      project.open_questions,
      `${what}.open_questions`,
      asString,
    ),
    blocked: asArray(project.blocked, `${what}.blocked`, asString),
    findings:
      project.findings === undefined || project.findings === null
        ? undefined
        : readNumberMap(project.findings, `${what}.findings`),
  };
}

function parseDigestDecision(value: unknown, what: string): DigestDecision {
  const decision = asObject(value, what);
  return {
    id: asString(decision.id, `${what}.id`),
    title: asString(decision.title, `${what}.title`),
  };
}

function parseDigestHandoff(value: unknown, what: string): DigestHandoff {
  const handoff = asObject(value, what);
  return {
    id: asString(handoff.id, `${what}.id`),
    summary: asString(handoff.summary, `${what}.summary`),
    nextAction: asOptionalString(handoff.next_action, `${what}.next_action`),
    createdAt: asTimestamp(handoff.created_at, `${what}.created_at`),
  };
}

function readNumberMap(value: unknown, what: string): Record<string, number> {
  const source = asObject(value, what);
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(source)) {
    result[key] = asNumber(item, `${what}.${key}`);
  }
  return result;
}
