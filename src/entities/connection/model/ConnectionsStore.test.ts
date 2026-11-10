import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsStore, type ConnectionsApi } from "./ConnectionsStore";
import type { Connection } from "./types";

const connection: Connection = {
  id: "github-main",
  provider: "github",
};

describe("ConnectionsStore", () => {
  it("loads when the engine starts and keeps last-known data when it stops", async () => {
    const engine = observable({ isRunning: false });
    const api: ConnectionsApi = {
      list: vi.fn(async () => [connection]),
      run: vi.fn(async () => ({ jobId: "job-1" })),
    };
    const store = new ConnectionsStore(api, engine);
    store.start();

    runInAction(() => {
      engine.isRunning = true;
    });
    await vi.waitFor(() => {
      expect(store.loaded).toBe(true);
    });
    expect(store.items).toEqual([connection]);
    expect(store.count).toBe(1);
    expect(store.stale).toBe(false);

    runInAction(() => {
      engine.isRunning = false;
    });
    expect(store.items).toEqual([connection]);
    expect(store.loaded).toBe(false);
    expect(store.stale).toBe(true);
    store.dispose();
  });

  it("does not call the local API while the engine is not running", async () => {
    const engine = observable({ isRunning: false });
    const list = vi.fn(async () => [connection]);
    const api: ConnectionsApi = {
      list,
      run: vi.fn(async () => ({ jobId: "job-1" })),
    };
    const store = new ConnectionsStore(api, engine);

    await store.load(true);
    expect(list).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
    store.dispose();
  });

  it("clears the stale flag after a successful reload", async () => {
    const engine = observable({ isRunning: true });
    const api: ConnectionsApi = {
      list: vi.fn(async () => [connection]),
      run: vi.fn(async () => ({ jobId: "job-1" })),
    };
    const store = new ConnectionsStore(api, engine);
    store.start();
    await vi.waitFor(() => {
      expect(store.loaded).toBe(true);
    });

    runInAction(() => {
      engine.isRunning = false;
    });
    runInAction(() => {
      engine.isRunning = true;
    });
    await vi.waitFor(() => {
      expect(store.stale).toBe(false);
      expect(store.loaded).toBe(true);
    });
    store.dispose();
  });

  it("re-subscribes after dispose so StrictMode remounts still load", async () => {
    const engine = observable({ isRunning: false });
    const api: ConnectionsApi = {
      list: vi.fn(async () => [connection]),
      run: vi.fn(async () => ({ jobId: "job-1" })),
    };
    const store = new ConnectionsStore(api, engine);
    store.start();
    store.dispose();
    store.start();

    runInAction(() => {
      engine.isRunning = true;
    });
    await vi.waitFor(() => {
      expect(store.loaded).toBe(true);
    });
    expect(store.items).toEqual([connection]);
    store.dispose();
  });

  it("keeps a readable error when the local API fails", async () => {
    const engine = observable({ isRunning: false });
    const api: ConnectionsApi = {
      list: vi.fn(async () => {
        throw new Error("agent is not running");
      }),
      run: vi.fn(async () => ({ jobId: "job-1" })),
    };
    const store = new ConnectionsStore(api, engine);
    store.start();
    runInAction(() => {
      engine.isRunning = true;
    });
    await vi.waitFor(() => {
      expect(store.error).toContain("agent is not running");
    });
    expect(store.items).toEqual([]);
    store.dispose();
  });
});
