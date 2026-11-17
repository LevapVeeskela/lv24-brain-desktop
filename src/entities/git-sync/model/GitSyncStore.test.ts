import { describe, expect, it, vi } from "vitest";
import type { GitSyncSource } from "../api/gitSyncApi";
import type { GitSyncStatus } from "./types";
import { GitSyncStore } from "./GitSyncStore";

function status(overrides: Partial<GitSyncStatus> = {}): GitSyncStatus {
  return {
    provider: "git",
    branch: "main",
    ahead: 0,
    behind: 0,
    changed: 0,
    dirty: false,
    unmerged: false,
    conflicts: [],
    conflictRecords: [],
    recovered: false,
    reindexed: false,
    lastSynced: null,
    ...overrides,
  };
}

function source(patch: Partial<GitSyncSource> = {}): GitSyncSource {
  return {
    status: vi.fn(async () => status()),
    sync: vi.fn(async () => status({ changed: 1 })),
    ...patch,
  };
}

describe("GitSyncStore", () => {
  it("loads status and does not reload a loaded store without force", async () => {
    const api = source();
    const store = new GitSyncStore(api);
    await store.load();
    await store.load();
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(store.status?.branch).toBe("main");
    expect(store.loaded).toBe(true);
  });

  it("syncs with push and exposes conflicts", async () => {
    const api = source({
      sync: vi.fn(async () => status({ changed: 2, dirty: false })),
    });
    const store = new GitSyncStore(api);
    expect(await store.sync(true)).toBe(true);
    expect(api.sync).toHaveBeenCalledWith(true);
    expect(store.status?.changed).toBe(2);
  });

  it("keeps the conflict paths after a failed sync", async () => {
    const api = source({
      status: vi.fn(async () =>
        status({ unmerged: true, conflicts: ["projects/p/state.md"] }),
      ),
      sync: vi.fn(async () => {
        throw new Error("git sync stopped on unresolved conflicts");
      }),
    });
    const store = new GitSyncStore(api);
    expect(await store.sync(true)).toBe(false);
    expect(store.error).toContain("unresolved conflicts");
    expect(store.hasConflicts).toBe(true);
    expect(store.conflicts).toEqual(["projects/p/state.md"]);
  });
});
