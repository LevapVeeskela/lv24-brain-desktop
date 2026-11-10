import { reaction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { SyncStore, type SyncEngine } from "./SyncStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function catalogue() {
  return {
    items: [
      { id: "github-main", provider: "github" },
      { id: "gitlab-main", provider: "gitlab" },
      { id: "notes-main", provider: "file" },
    ],
    error: null as string | null,
    load: vi.fn(async () => undefined),
  };
}

function engine(patch: Partial<SyncEngine> = {}): SyncEngine {
  return {
    isRunning: true,
    isUpdating: false,
    startEngine: vi.fn(async () => true),
    ...patch,
  };
}

describe("SyncStore", () => {
  it("counts queue requests separately from completed ingestion", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("already running"))
      .mockResolvedValueOnce({ jobId: "job-3" });
    const store = new SyncStore({ run }, engine(), catalogue());
    await store.runAll();
    expect(run).toHaveBeenCalledTimes(3);
    expect(store.summary).toEqual({
      total: 3, attempted: 3, queued: 2,
      failures: [{ connectionId: "gitlab-main", error: "already running" }],
      remaining: 0, canceled: false,
    });
    expect(store.progress).toEqual({ total: 3, attempted: 3, queued: 2, failed: 1, currentConnectionId: null });
    expect(store.busy).toBe(false);
    expect(store.error).toBeNull();
  });

  it("cancels before enqueue while the catalogue is still loading", async () => {
    const loading = deferred<undefined>();
    const connections = catalogue();
    connections.load = vi.fn(() => loading.promise);
    const run = vi.fn(async () => ({ jobId: "unused" }));
    const store = new SyncStore({ run }, engine(), connections);
    const syncing = store.runAll();
    expect(store.progress).toBeNull();
    expect(store.cancelRemaining()).toBe(true);
    expect(store.cancelRemaining()).toBe(false);
    loading.resolve(undefined);
    await syncing;
    expect(run).not.toHaveBeenCalled();
    expect(store.summary).toEqual({ total: 3, attempted: 0, queued: 0, failures: [], remaining: 3, canceled: true });
    expect(store.busy).toBe(false);
  });

  it("lets an in-flight enqueue settle and skips the remaining connections", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const run = vi.fn(() => { started.resolve(); return request.promise; });
    const store = new SyncStore({ run }, engine(), catalogue());
    const syncing = store.runAll();
    await started.promise;
    expect(store.progress).toEqual({ total: 3, attempted: 0, queued: 0, failed: 0, currentConnectionId: "github-main" });
    expect(store.cancelRemaining()).toBe(true);
    expect(store.busy).toBe(true);
    request.resolve({ jobId: "accepted-before-stop" });
    await syncing;
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.summary).toEqual({ total: 3, attempted: 1, queued: 1, failures: [], remaining: 2, canceled: true });
  });

  it("stops between entries when cancellation follows a progress update", async () => {
    const run = vi.fn(async () => ({ jobId: "accepted" }));
    const store = new SyncStore({ run }, engine(), catalogue());
    const dispose = reaction(() => store.progress?.attempted, (attempted) => {
      if (attempted === 1) store.cancelRemaining();
    });
    try { await store.runAll(); } finally { dispose(); }
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.summary?.remaining).toBe(2);
    expect(store.summary?.canceled).toBe(true);
  });

  it("accounts for a rejected in-flight request even after a stop request", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const run = vi.fn(() => { started.resolve(); return request.promise; });
    const store = new SyncStore({ run }, engine(), catalogue());
    const syncing = store.runAll();
    await started.promise;
    store.cancelRemaining();
    request.reject(new Error("queue full"));
    await syncing;
    expect(store.summary).toEqual({
      total: 3, attempted: 1, queued: 0,
      failures: [{ connectionId: "github-main", error: "queue full" }], remaining: 2, canceled: true,
    });
  });

  it("does not claim cancellation when only the last request remains in flight", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const connections = catalogue();
    connections.items.splice(1);
    const store = new SyncStore({ run: () => { started.resolve(); return request.promise; } }, engine(), connections);
    const syncing = store.runAll();
    await started.promise;
    expect(store.canCancelRemaining).toBe(false);
    expect(store.cancelRemaining()).toBe(false);
    request.resolve({ jobId: "last" });
    await syncing;
    expect(store.summary?.canceled).toBe(false);
    expect(store.summary?.remaining).toBe(0);
    expect(store.cancelRemaining()).toBe(false);
  });

  it("takes an immutable ID snapshot and rejects duplicate starts while busy", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const connections = catalogue();
    const second = connections.items[1];
    const run = vi.fn((id: string) => {
      if (id === "github-main") { started.resolve(); return request.promise; }
      return Promise.resolve({ jobId: id });
    });
    const store = new SyncStore({ run }, engine(), connections);
    const syncing = store.runAll();
    await started.promise;
    await store.runAll();
    second.id = "replacement-id";
    connections.items.splice(1, 2, { id: "new-item", provider: "file" });
    request.resolve({ jobId: "first" });
    await syncing;
    expect(run.mock.calls.map(([id]) => id)).toEqual(["github-main", "gitlab-main", "notes-main"]);
    expect(store.summary?.total).toBe(3);
    expect(connections.load).toHaveBeenCalledTimes(1);
  });

  it("does not claim success when the agent cannot start", async () => {
    const connections = catalogue();
    const run = vi.fn();
    const store = new SyncStore({ run }, engine({ isRunning: false, startEngine: vi.fn(async () => false) }), connections);
    await store.runAll();
    expect(store.error).toContain("did not start");
    expect(store.summary).toBeNull();
    expect(store.busy).toBe(false);
    expect(connections.load).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses to start a sync while the agent is being updated", async () => {
    const updatingEngine = engine({ isRunning: false, isUpdating: true });
    const connections = catalogue();
    const run = vi.fn();
    const store = new SyncStore({ run }, updatingEngine, connections);
    await store.runAll();
    expect(updatingEngine.startEngine).not.toHaveBeenCalled();
    expect(connections.load).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(store.busy).toBe(false);
    expect(store.error).toContain("updating");
    expect(store.summary).toBeNull();
  });
});
