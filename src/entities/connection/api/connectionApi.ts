import { apiClient, toApiError } from "@/shared/api/client";
import type {
  Connection,
  CreateConnectionInput,
  ConnectorStatus,
  Run,
  RunAccepted,
  RunStats,
  Schedule,
} from "../model/types";

export class ConnectionApi {
  async list(): Promise<Connection[]> {
    const { data, error, response } = await apiClient.GET("/v1/connections");
    if (error) {
      throw toApiError(response, error);
    }
    return parseConnections(data);
  }

  async get(id: string): Promise<Connection> {
    const { data, error, response } = await apiClient.GET(
      "/v1/connections/{id}",
      { params: { path: { id } } },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseConnection(data);
  }

  async create(input: CreateConnectionInput): Promise<Connection> {
    const { data, error, response } = await apiClient.POST("/v1/connections", {
      body: {
        id: input.id,
        provider: input.provider,
        backend: input.backend,
        account: input.account,
        baseUrl: input.baseUrl,
        projects: input.projects,
        schedule: input.schedule,
        publish: input.publish,
        settings: input.settings,
      },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseConnection(data);
  }

  async remove(id: string): Promise<void> {
    const { error, response } = await apiClient.DELETE(
      "/v1/connections/{id}",
      { params: { path: { id } } },
    );
    if (error) {
      throw toApiError(response, error);
    }
  }

  async setCredential(id: string, field: string, value: string): Promise<void> {
    const { error, response } = await apiClient.POST(
      "/v1/connections/{id}/credentials/{field}",
      {
        params: { path: { id, field } },
        body: { value },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
  }

  async setSchedule(id: string, schedule: string): Promise<void> {
    const { error, response } = await apiClient.PUT("/v1/schedules/{connectionId}", {
      params: { path: { connectionId: id } },
      body: { schedule },
    });
    if (error) {
      throw toApiError(response, error);
    }
  }

  async listSchedules(): Promise<Schedule[]> {
    const { data, error, response } = await apiClient.GET("/v1/schedules");
    if (error) {
      throw toApiError(response, error);
    }
    return parseSchedules(data);
  }

  async run(id: string): Promise<RunAccepted> {
    const { data, error, response } = await apiClient.POST(
      "/v1/connections/{id}/run",
      {
        params: { path: { id } },
        body: {},
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseRunAccepted(data);
  }

  async test(id: string): Promise<void> {
    const { error, response } = await apiClient.POST(
      "/v1/connections/{id}/test",
      { params: { path: { id } } },
    );
    if (error) {
      throw toApiError(response, error);
    }
  }

  async listRuns(limit = 20): Promise<Run[]> {
    const { data, error, response } = await apiClient.GET("/v1/runs", {
      params: { query: { limit } },
    });
    if (error) {
      throw toApiError(response, error);
    }
    return parseRuns(data);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConnection(value: unknown): Connection {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) {
    throw new Error("local API returned a connection without an id");
  }
  if (typeof value.provider !== "string" || !value.provider) {
    throw new Error(`local API returned a ${value.id} without a provider`);
  }
  return {
    id: value.id,
    provider: value.provider,
    backend: optionalEnum(value.backend, ["native", "mcp", "process"]),
    account: optionalString(value.account),
    baseUrl: optionalString(value.baseUrl),
    projects: optionalStringArray(value.projects),
    schedule: optionalString(value.schedule),
    publish: optionalEnum(value.publish, ["local-only", "shared"]),
    settings: optionalStringRecord(value.settings),
  };
}

export function parseConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array connections response");
  }
  return value.map(parseConnection);
}

function parseRunAccepted(value: unknown): RunAccepted {
  if (!isRecord(value) || typeof value.jobId !== "string" || !value.jobId) {
    throw new Error("local API returned no job id");
  }
  return { jobId: value.jobId };
}

export function parseRuns(value: unknown): Run[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array runs response");
  }
  return value.map(parseRun);
}

export function parseSchedules(value: unknown): Schedule[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array schedules response");
  }
  return value.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.connectionId !== "string" ||
      typeof item.schedule !== "string"
    ) {
      throw new Error("local API returned an invalid schedule");
    }
    return { connectionId: item.connectionId, schedule: item.schedule };
  });
}

function parseRun(value: unknown): Run {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.source !== "string" ||
    typeof value.startedAt !== "string"
  ) {
    throw new Error("local API returned an invalid run");
  }
  return {
    id: value.id,
    source: value.source,
    connectionId: optionalString(value.connectionId),
    status: parseStatus(value.status),
    startedAt: value.startedAt,
    finishedAt: optionalString(value.finishedAt),
    counts: optionalNumberRecord(value.counts),
    stats: parseStats(value.stats),
  };
}

function parseStatus(value: unknown): ConnectorStatus {
  if (
    value === "running" ||
    value === "success" ||
    value === "partial" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error("local API returned an unknown run status");
}

function parseStats(value: unknown): RunStats | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("local API returned invalid run stats");
  }
  const number = (key: string): number => {
    const item = value[key];
    return typeof item === "number" && Number.isFinite(item) ? item : 0;
  };
  return {
    seen: number("seen"),
    upserted: number("upserted"),
    unchanged: number("unchanged"),
    deleted: number("deleted"),
    skipped: number("skipped"),
    batches: number("batches"),
    truncated: optionalString(value.truncated),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("local API returned an invalid string array");
  }
  return value;
}

function optionalStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("local API returned an invalid settings object");
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") {
      throw new Error("local API returned a non-string setting");
    }
    result[key] = item;
  }
  return result;
}

function optionalNumberRecord(
  value: unknown,
): Record<string, number> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("local API returned an invalid counts object");
  }
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "number") {
      throw new Error("local API returned a non-number count");
    }
    result[key] = item;
  }
  return result;
}

function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error("local API returned an invalid enum value");
}
