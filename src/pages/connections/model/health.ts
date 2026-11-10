import type { Connection, Run } from "@/entities/connection/model/types";
import {
  runHealthStatus,
  type RunDisplayStatus,
  type RunHealthStatus,
} from "@/entities/run/model/presentation";

export type HealthFilter = "all" | RunDisplayStatus | "unknown";
export type ConnectionSort = "name" | "status" | "recent";

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function latestConnectionRun(
  connectionId: string,
  runs: readonly Run[],
): Run | undefined {
  return runs
    .filter((run) =>
      run.connectionId === connectionId ||
      (!run.connectionId && run.id.startsWith(`${connectionId}-`)),
    )
    .reduce<Run | undefined>((latest, run) =>
      !latest || timestamp(run.startedAt) > timestamp(latest.startedAt)
        ? run
        : latest,
      undefined,
    );
}

const severity: Record<RunHealthStatus, number> = {
  failed: 0,
  partial: 1,
  canceled: 2,
  running: 3,
  unknown: 4,
  success: 5,
};

export function selectConnections(
  connections: readonly Connection[],
  runs: readonly Run[],
  query: string,
  filter: HealthFilter,
  sort: ConnectionSort,
): Array<{ connection: Connection; run: Run | undefined }> {
  const needle = query.trim().toLocaleLowerCase();
  return connections
    .map((connection) => ({ connection, run: latestConnectionRun(connection.id, runs) }))
    .filter(({ connection, run }) => {
      const matchesSearch = !needle ||
        [connection.id, connection.provider, connection.account ?? ""]
          .join(" ").toLocaleLowerCase().includes(needle);
      const matchesStatus = filter === "all" || runHealthStatus(run) === filter;
      return matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      if (sort === "status") {
        const order = severity[runHealthStatus(left.run)] - severity[runHealthStatus(right.run)];
        if (order) return order;
      }
      if (sort === "recent") {
        const order = timestamp(right.run?.startedAt ?? "") - timestamp(left.run?.startedAt ?? "");
        if (order) return order;
      }
      return left.connection.id.localeCompare(right.connection.id);
    });
}
