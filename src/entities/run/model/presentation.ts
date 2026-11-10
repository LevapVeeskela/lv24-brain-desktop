import type { ConnectorStatus, Run } from "@/entities/connection/model/types";

/** UI-only status. The local API's existing wire enum is unchanged. */
export type RunDisplayStatus = ConnectorStatus | "canceled";
export type RunHealthStatus = RunDisplayStatus | "unknown";

export function runDisplayStatus(run: Run): RunDisplayStatus {
  return run.status !== "running" && run.stats?.truncated === "canceled"
    ? "canceled"
    : run.status;
}

export function runHealthStatus(run: Run | undefined): RunHealthStatus {
  return run ? runDisplayStatus(run) : "unknown";
}

export function isRunFailure(run: Run): boolean {
  const status = runDisplayStatus(run);
  return status === "failed" || status === "partial";
}
