import { describe, expect, it } from "vitest";
import type { Run } from "@/entities/connection/model/types";
import { latestConnectionRun, selectConnections } from "./health";

const run = (id: string, status: Run["status"], startedAt: string, connectionId?: string): Run => ({ id, status, startedAt, connectionId, source: "github" });

describe("connection health presentation", () => {
  it("uses the most recent timestamp and keeps missing history unknown", () => {
    const older = run("one-old", "failed", "2026-11-01T00:00:00Z", "one");
    const newer = run("one-new", "success", "2026-11-02T00:00:00Z", "one");
    expect(latestConnectionRun("one", [newer, older])).toBe(newer);
    expect(latestConnectionRun("two", [newer, older])).toBeUndefined();
  });

  it("only falls back to legacy id prefixes when explicit ownership is absent", () => {
    const foreign = run("one-foreign", "failed", "2026-11-03T00:00:00Z", "two");
    const legacy = run("one-legacy", "partial", "2026-11-02T00:00:00Z");
    expect(latestConnectionRun("one", [foreign, legacy])).toBe(legacy);
  });

  it("filters canceled runs by the presentation status, not the wire partial", () => {
    const connections = [{ id: "b", provider: "gitlab" }];
    const canceled: Run = {
      id: "b-1", status: "partial", startedAt: "2026-11-03T00:00:00Z", connectionId: "b", source: "gitlab",
      stats: { seen: 25, upserted: 25, unchanged: 0, deleted: 0, skipped: 0, batches: 1, truncated: "canceled" },
    };
    expect(selectConnections(connections, [canceled], "", "canceled", "name").map(({ connection }) => connection.id)).toEqual(["b"]);
    expect(selectConnections(connections, [canceled], "", "partial", "name")).toEqual([]);
  });

  it("filters and sorts without mutating the catalogue or run history", () => {
    const connections = [{ id: "b", provider: "gitlab" }, { id: "a", provider: "github", account: "team" }, { id: "c", provider: "github" }];
    const runs = [run("a-1", "success", "2026-11-02T00:00:00Z", "a"), run("b-1", "failed", "2026-11-03T00:00:00Z", "b")];
    expect(selectConnections(connections, runs, "", "all", "status").map(({ connection }) => connection.id)).toEqual(["b", "c", "a"]);
    expect(selectConnections(connections, runs, "team", "success", "name").map(({ connection }) => connection.id)).toEqual(["a"]);
    expect(selectConnections(connections, runs, "", "unknown", "recent").map(({ connection }) => connection.id)).toEqual(["c"]);
    expect(connections.map(({ id }) => id)).toEqual(["b", "a", "c"]);
  });
});
