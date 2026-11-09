export type ConnectionBackend = "native" | "mcp" | "process";
export type PublishPolicy = "local-only" | "shared";

export interface Connection {
  id: string;
  provider: string;
  backend?: ConnectionBackend;
  account?: string;
  baseUrl?: string;
  projects?: string[];
  schedule?: string;
  publish?: PublishPolicy;
  settings?: Record<string, string>;
}

export type ConnectorStatus = "running" | "success" | "partial" | "failed";

export interface RunStats {
  seen: number;
  upserted: number;
  unchanged: number;
  deleted: number;
  skipped: number;
  batches: number;
  truncated?: string;
}

export interface Run {
  id: string;
  source: string;
  connectionId?: string;
  status: ConnectorStatus;
  startedAt: string;
  finishedAt?: string;
  counts?: Record<string, number>;
  stats?: RunStats;
}

export interface RunAccepted {
  jobId: string;
}
