import { observable, runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { ConnectionsStore, type ConnectionsApi } from "./ConnectionsStore";
import type { Connection } from "./types";

const connection: Connection = {
  id: "github-main",
  provider: "github",
};

describe("ConnectionsStore", () => {
  it("loads when the engine starts and resets when it stops", async () => {
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

    runInAction(() => {
      engine.isRunning = false;
    });
    expect(store.items).toEqual([]);
    expect(store.loaded).toBe(false);
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
