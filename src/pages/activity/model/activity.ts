import type { Run } from "@/entities/connection/model/types";
import type {
  MemoryRecord,
  ProvenanceOrigin,
} from "@/entities/memory/model/types";

export const ACTIVITY_FILTERS = ["all", "me", "agents", "connections"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export type ActivityActor = "me" | "agents" | "connections" | "other";

export interface ActivityRow {
  key: string;
  type: "run" | "record";
  time: string;
  actor: ActivityActor;
  projectId: string | null;
  title: string;
  detail: string;
  run?: Run;
  record?: MemoryRecord;
}

export interface ActivityProjectGroup {
  projectId: string | null;
  projectName: string;
  rows: ActivityRow[];
}

export interface ActivityDayGroup {
  day: string;
  projects: ActivityProjectGroup[];
}

export interface ActivityInput {
  runs: readonly Run[];
  records: readonly MemoryRecord[];
  /** First project of each connection, from the connection catalogue. */
  connectionProjects: Readonly<Record<string, string | undefined>>;
  projectNames: Readonly<Record<string, string>>;
  projectId: string | null;
  filter: ActivityFilter;
}

export function isActivityFilter(value: string | null): value is ActivityFilter {
  return value !== null && ACTIVITY_FILTERS.includes(value as ActivityFilter);
}

export function actorOfRun(run: Run): ActivityActor {
  return run.connectionId ? "connections" : "agents";
}

export function actorOfRecord(origin: ProvenanceOrigin): ActivityActor {
  switch (origin) {
    case "human":
      return "me";
    case "agent":
      return "agents";
    case "connector":
      return "connections";
    default:
      return "other";
  }
}

export function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildActivityDays(input: ActivityInput): ActivityDayGroup[] {
  const rows = [
    ...input.runs.map((run) => runRow(run, input)),
    ...input.records.map((record) => recordRow(record)),
  ]
    .filter((row): row is ActivityRow => row !== null)
    .filter((row) => input.filter === "all" || row.actor === input.filter)
    .filter((row) => input.projectId === null || row.projectId === input.projectId)
    .sort((left, right) => timestamp(right.time) - timestamp(left.time));

  const days = new Map<string, Map<string, ActivityProjectGroup>>();
  for (const row of rows) {
    const day = dayKey(row.time);
    const projectKey = row.projectId ?? "";
    const projects = days.get(day) ?? new Map<string, ActivityProjectGroup>();
    const group = projects.get(projectKey) ?? {
      projectId: row.projectId,
      projectName: row.projectId
        ? (input.projectNames[row.projectId] ?? row.projectId)
        : "",
      rows: [],
    };
    group.rows.push(row);
    projects.set(projectKey, group);
    days.set(day, projects);
  }

  return [...days.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([day, projects]) => ({
      day,
      projects: [...projects.values()].sort((left, right) =>
        left.projectName.localeCompare(right.projectName),
      ),
    }));
}

function runRow(run: Run, input: ActivityInput): ActivityRow | null {
  const projectId =
    run.projectIds?.[0] ??
    (run.connectionId
      ? (input.connectionProjects[run.connectionId] ?? null)
      : null);
  return {
    key: `run-${run.id}`,
    type: "run",
    time: run.startedAt,
    actor: actorOfRun(run),
    projectId,
    title: run.connectionId ?? run.source,
    detail: run.source,
    run,
  };
}

function recordRow(record: MemoryRecord): ActivityRow | null {
  const time = record.updatedAt ?? record.createdAt;
  if (!time) {
    return null;
  }
  return {
    key: `record-${record.id}`,
    type: "record",
    time,
    actor: actorOfRecord(record.provenance.origin),
    projectId: record.projectId,
    title: record.title,
    detail: record.kind,
    record,
  };
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
