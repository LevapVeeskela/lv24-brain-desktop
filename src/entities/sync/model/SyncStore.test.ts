import { reaction } from "mobx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalApiError } from "@/shared/api/client";
import type { Run } from "@/entities/connection/model/types";
import {
  SyncStore,
  type SyncEngine,
  type SyncRunApi,
} from "./SyncStore";

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

function sampleRun(
  id: string,
  status: Run["status"],
  connectionId: string,
  truncated?: string,
): Run {
  return {
    id,
    source: connectionId.split("-")[0] ?? "github",
    connectionId,
    status,
    startedAt: "2026-11-10T00:00:00Z",
    stats: {
      seen: 0, upserted: 0, unchanged: 0, deleted: 0, skipped: 0, batches: 0,
      ...(truncated ? { truncated } : {}),
    },
  };
}

function fakeApi(patch: Partial<SyncRunApi> = {}): SyncRunApi {
  return {
    run: vi.fn(async (id: string) => ({ jobId: `job-${id}` })),
    listRuns: vi.fn(async () => [] as Run[]),
    cancelRun: vi.fn(async () => undefined),
    ...patch,
  };
}

const stores: SyncStore[] = [];
function makeStore(
  api: SyncRunApi,
  connections = catalogue(),
  syncingEngine = engine(),
): SyncStore {
  const store = new SyncStore(api, syncingEngine, connections);
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.dispose();
  }
  vi.useRealTimers();
});

describe("SyncStore", () => {
  it("counts queue requests separately from completed ingestion", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ jobId: "job-1" })
      .mockRejectedValueOnce(new Error("already running"))
      .mockResolvedValueOnce({ jobId: "job-3" });
    const store = makeStore(fakeApi({ run }));
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
    // Queueing is over, but the accepted jobs keep the batch active.
    expect(store.syncing).toBe(true);
    expect(store.activeJobCount).toBe(2);
  });

  it("cancels before enqueue while the catalogue is still loading", async () => {
    const loading = deferred<undefined>();
    const connections = catalogue();
    connections.load = vi.fn(() => loading.promise);
    const run = vi.fn(async () => ({ jobId: "unused" }));
    const store = makeStore(fakeApi({ run }), connections);
    const syncing = store.runAll();
    expect(store.progress).toBeNull();
    expect(await store.cancelAll()).toBe(true);
    expect(await store.cancelAll()).toBe(false);
    loading.resolve(undefined);
    await syncing;
    expect(run).not.toHaveBeenCalled();
    expect(store.summary).toEqual({ total: 3, attempted: 0, queued: 0, failures: [], remaining: 3, canceled: true });
    expect(store.busy).toBe(false);
    expect(store.connectionProgress.every(({ state }) => state === "canceled")).toBe(true);
  });

  it("lets an in-flight enqueue settle, skips the rest and cancels the late job", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const run = vi.fn(() => { started.resolve(); return request.promise; });
    const cancelRun = vi.fn(async (_id: string) => undefined);
    const store = makeStore(fakeApi({ run, cancelRun }));
    const syncing = store.runAll();
    await started.promise;
    expect(store.progress).toEqual({ total: 3, attempted: 0, queued: 0, failed: 0, currentConnectionId: "github-main" });
    expect(await store.cancelAll()).toBe(true);
    expect(store.busy).toBe(true);
    request.resolve({ jobId: "accepted-before-stop" });
    await syncing;
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.summary).toEqual({ total: 3, attempted: 1, queued: 1, failures: [], remaining: 2, canceled: true });
    // The accepted job arrived after the cancel decision; it must not run.
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledWith("accepted-before-stop"));
    expect(store.cancelStates["github-main"]).toBe("accepted");
  });

  it("stops between entries when cancellation follows a progress update", async () => {
    const run = vi.fn(async () => ({ jobId: "accepted" }));
    const store = makeStore(fakeApi({ run }));
    const dispose = reaction(() => store.progress?.attempted, (attempted) => {
      if (attempted === 1) void store.cancelAll();
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
    const store = makeStore(fakeApi({ run }));
    const syncing = store.runAll();
    await started.promise;
    expect(await store.cancelAll()).toBe(true);
    request.reject(new Error("queue full"));
    await syncing;
    expect(store.summary).toEqual({
      total: 3, attempted: 1, queued: 0,
      failures: [{ connectionId: "github-main", error: "queue full" }], remaining: 2, canceled: true,
    });
    expect(store.connectionProgress[0]?.state).toBe("failed");
  });

  it("cancels an accepted job while the last enqueue request is still in flight", async () => {
    const started = deferred<void>();
    const request = deferred<{ jobId: string }>();
    const connections = catalogue();
    connections.items.splice(1);
    const cancelRun = vi.fn(async (_id: string) => undefined);
    const store = makeStore(
      fakeApi({ run: () => { started.resolve(); return request.promise; }, cancelRun }),
      connections,
    );
    const syncing = store.runAll();
    await started.promise;
    expect(store.canCancel).toBe(true);
    expect(await store.cancelAll()).toBe(true);
    request.resolve({ jobId: "last" });
    await syncing;
    expect(store.summary?.canceled).toBe(true);
    expect(store.summary?.remaining).toBe(0);
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledWith("last"));
    expect(await store.cancelAll()).toBe(false);
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
    const store = makeStore(fakeApi({ run }), connections);
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
    const store = makeStore(
      fakeApi({ run }),
      connections,
      engine({ isRunning: false, startEngine: vi.fn(async () => false) }),
    );
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
    const store = makeStore(fakeApi({ run }), connections, updatingEngine);
    await store.runAll();
    expect(updatingEngine.startEngine).not.toHaveBeenCalled();
    expect(connections.load).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(store.busy).toBe(false);
    expect(store.error).toContain("updating");
    expect(store.summary).toBeNull();
  });

  it("keeps polling after queueing and maps accepted jobs to their run states", async () => {
    vi.useFakeTimers();
    const runs: Run[] = [];
    const listRuns = vi.fn(async () => runs.slice());
    const run = vi.fn(async (id: string) => ({ jobId: `job-${id}` }));
    const store = makeStore(fakeApi({ run, listRuns }));
    vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));

    await store.runAll();
    expect(store.busy).toBe(false);
    // The enqueue loop is over but three accepted jobs are still active, so
    // the panel must stay mounted instead of reporting the sync complete.
    expect(store.syncing).toBe(true);
    expect(store.activeJobCount).toBe(3);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["queued", "queued", "queued"]);
    const runCalls = run.mock.calls.length;
    await store.runAll();
    expect(run.mock.calls.length).toBe(runCalls);

    runs.push(
      sampleRun("job-github-main", "running", "github-main"),
      sampleRun("job-gitlab-main", "running", "gitlab-main"),
      sampleRun("job-notes-main", "running", "notes-main"),
    );
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["running", "running", "running"]);

    runs.splice(0, runs.length,
      sampleRun("job-github-main", "success", "github-main"),
      sampleRun("job-gitlab-main", "partial", "gitlab-main", "canceled"),
      sampleRun("job-notes-main", "failed", "notes-main"),
    );
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["success", "canceled", "failed"]);
    expect(store.syncing).toBe(false);
    expect(store.activeJobCount).toBe(0);

    const calls = listRuns.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listRuns).toHaveBeenCalledTimes(calls);
  });

  it("cancels every accepted non-terminal job and polls until they are terminal", async () => {
    vi.useFakeTimers();
    const runs: Run[] = [];
    const listRuns = vi.fn(async () => runs.slice());
    const cancelRun = vi.fn(async (_id: string) => undefined);
    const store = makeStore(fakeApi({ listRuns, cancelRun }));

    await store.runAll();
    runs.push(
      sampleRun("job-github-main", "running", "github-main"),
      sampleRun("job-gitlab-main", "running", "gitlab-main"),
      sampleRun("job-notes-main", "running", "notes-main"),
    );
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["running", "running", "running"]);
    // Queueing is done, but the accepted jobs keep the Cancel control alive.
    expect(store.busy).toBe(false);
    expect(store.canCancel).toBe(true);

    expect(await store.cancelAll()).toBe(true);
    expect(cancelRun.mock.calls.map(([id]) => id).sort()).toEqual([
      "job-github-main", "job-gitlab-main", "job-notes-main",
    ]);
    expect(store.cancelRequested).toBe(true);
    expect(store.syncing).toBe(true);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["running", "running", "running"]);

    runs.splice(0, runs.length,
      sampleRun("job-github-main", "partial", "github-main", "canceled"),
      sampleRun("job-gitlab-main", "partial", "gitlab-main", "canceled"),
      sampleRun("job-notes-main", "partial", "notes-main", "canceled"),
    );
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["canceled", "canceled", "canceled"]);
    expect(store.syncing).toBe(false);
    expect(store.activeJobCount).toBe(0);
  });

  it("treats 404/409 cancel responses as already finished, not as a failure", async () => {
    const cancelRun = vi.fn(async () => {
      throw new LocalApiError(409, "conflict", "job has already finished");
    });
    const store = makeStore(fakeApi({ cancelRun }));
    await store.runAll();
    expect(await store.cancelAll()).toBe(true);
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledTimes(3));
    expect(store.progressError).toBeNull();
    expect(store.cancelStates).toEqual({});
  });

  it("reports a real cancel failure per connection", async () => {
    const cancelRun = vi.fn(async () => {
      throw new Error("engine offline");
    });
    const store = makeStore(fakeApi({ cancelRun }));
    await store.runAll();
    await store.cancelAll();
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledTimes(3));
    expect(store.progressError).toContain("engine offline");
    expect(store.cancelStates["github-main"]).toBe("failed");
    expect(store.cancelRequested).toBe(true);
  });

  it("ignores a poll response that arrives after polling stops", async () => {
    const pending = deferred<Run[]>();
    const listRuns = vi.fn(() => pending.promise);
    const store = makeStore(fakeApi({ listRuns }));
    await store.runAll();
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["queued", "queued", "queued"]);
    store.dispose();
    pending.resolve([sampleRun("job-github-main", "failed", "github-main")]);
    await pending.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["queued", "queued", "queued"]);
  });

  it("stops polling after repeated failures and reports the reason", async () => {
    vi.useFakeTimers();
    const listRuns = vi.fn(async () => {
      throw new Error("engine offline");
    });
    const store = makeStore(fakeApi({ listRuns }));
    await store.runAll();
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(listRuns).toHaveBeenCalledTimes(3);
    expect(store.progressError).toContain("engine offline");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listRuns).toHaveBeenCalledTimes(3);
  });

  it("stops polling after the bounded settle window without claiming completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
    const runs = [
      sampleRun("job-github-main", "running", "github-main"),
      sampleRun("job-gitlab-main", "running", "gitlab-main"),
      sampleRun("job-notes-main", "running", "notes-main"),
    ];
    const store = new SyncStore(
      fakeApi({ listRuns: async () => runs }),
      engine(),
      catalogue(),
      { pollIntervalMs: 60_000 },
    );
    stores.push(store);
    await store.runAll();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["running", "running", "running"]);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(store.progressStale).toBe(true);
    expect(store.syncing).toBe(true);
    expect(store.connectionProgress.map(({ state }) => state)).toEqual(["running", "running", "running"]);
  });
});
