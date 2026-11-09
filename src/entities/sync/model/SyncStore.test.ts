import { describe, expect, it, vi } from "vitest";
import { SyncStore, type SyncConnections, type SyncEngine } from "./SyncStore";

const connections: SyncConnections = {
  items: [
    { id: "github-main", provider: "github" },
    { id: "gitlab-main", provider: "gitlab" },
  ],
  error: null,
  load: vi.fn(async () => undefined),
};

const engine: SyncEngine = {
  isRunning: true,
  startEngine: vi.fn(async () => true),
};

describe("SyncStore", () => {
  it("queues every connection and reports failures separately", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("already running"));
    const store = new SyncStore({ run }, engine, connections);

    await store.runAll();

    expect(run).toHaveBeenCalledTimes(2);
    expect(store.summary).toEqual({
      total: 2,
      queued: 1,
      failures: [{ connectionId: "gitlab-main", error: "already running" }],
    });
    expect(store.busy).toBe(false);
    expect(store.error).toBeNull();
  });

  it("does not claim success when the agent cannot start", async () => {
    const failingEngine: SyncEngine = {
      isRunning: false,
      startEngine: vi.fn(async () => false),
    };
    const store = new SyncStore({ run: vi.fn() }, failingEngine, connections);
    await store.runAll();
    expect(store.error).toContain("did not start");
    expect(store.summary).toBeNull();
    expect(store.busy).toBe(false);
  });
});
