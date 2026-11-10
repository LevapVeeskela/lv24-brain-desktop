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
  isUpdating: false,
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
      isUpdating: false,
      startEngine: vi.fn(async () => false),
    };
    const store = new SyncStore({ run: vi.fn() }, failingEngine, connections);
    await store.runAll();
    expect(store.error).toContain("did not start");
    expect(store.summary).toBeNull();
    expect(store.busy).toBe(false);
  });

  it("refuses to start a sync while the agent is being updated", async () => {
    const updatingEngine: SyncEngine = {
      isRunning: false,
      isUpdating: true,
      startEngine: vi.fn(async () => true),
    };
    const run = vi.fn();
    const store = new SyncStore({ run }, updatingEngine, connections);

    await store.runAll();

    expect(updatingEngine.startEngine).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(store.busy).toBe(false);
    expect(store.error).toContain("updating");
    expect(store.summary).toBeNull();
  });
});
