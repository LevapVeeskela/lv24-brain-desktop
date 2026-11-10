import { runInAction } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../api/engineApi", () => ({
  engineApi: {
    status: vi.fn(),
    start: vi.fn(),
    pause: vi.fn(),
    setAutostart: vi.fn(),
    quit: vi.fn(),
    takeDeepLink: vi.fn(),
  },
}));

import { engineApi } from "../api/engineApi";
import type { EnginePhase, ShellStatus } from "./types";
import { EngineStore } from "./EngineStore";

function shellStatus(phase: EnginePhase, updating = false): ShellStatus {
  return {
    engine: {
      phase,
      running: phase === "running",
      owned: phase === "running",
      restarts: 0,
    },
    paused: phase === "paused",
    updating,
    autostart: { enabled: false, supported: true },
    desktopVersion: "1.0.1",
    deepLinkScheme: "lv24brain",
    logDir: "C:/logs",
  };
}

describe("EngineStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an explicit initializing phase until status is known", () => {
    const store = new EngineStore();
    expect(store.phase).toBe("initializing");
  });

  it("marks an initial status failure as unavailable", async () => {
    vi.mocked(engineApi.status).mockRejectedValue(new Error("shell offline"));
    const store = new EngineStore();

    await store.refresh();

    expect(store.phase).toBe("unavailable");
    expect(store.statusError).toContain("shell offline");
  });

  it("keeps poll failures out of the action error and stays unavailable after dismiss", async () => {
    vi.mocked(engineApi.status).mockRejectedValue(new Error("shell offline"));
    const store = new EngineStore();

    await store.refresh();

    expect(store.error).toBeNull();
    expect(store.statusError).toContain("shell offline");
    expect(store.phase).toBe("unavailable");

    store.dismissError();

    expect(store.statusError).toBeNull();
    expect(store.phase).toBe("unavailable");
  });

  it("clears the status error only after a successful refresh", async () => {
    vi.mocked(engineApi.status).mockRejectedValueOnce(
      new Error("shell offline"),
    );
    const store = new EngineStore();
    await store.refresh();

    vi.mocked(engineApi.status).mockResolvedValue(shellStatus("running"));
    await store.refresh();

    expect(store.statusError).toBeNull();
    expect(store.phase).toBe("running");
  });

  it("does not let a poll failure overwrite a user-action error", async () => {
    vi.mocked(engineApi.start).mockRejectedValue(new Error("spawn failed"));
    vi.mocked(engineApi.status).mockRejectedValue(new Error("shell offline"));
    const store = new EngineStore();

    await store.startEngine();
    await store.refresh();

    expect(store.error).toContain("spawn failed");
    expect(store.statusError).toContain("shell offline");
  });

  it("refuses to start while the agent is being updated", async () => {
    const store = new EngineStore();
    runInAction(() => {
      store.status = shellStatus("running", true);
    });

    const started = await store.startEngine();

    expect(started).toBe(false);
    expect(engineApi.start).not.toHaveBeenCalled();
    expect(store.error).toContain("updating");
    expect(store.busy).toBeNull();
  });

  it("never pauses an agent that is not running", async () => {
    vi.mocked(engineApi.status).mockResolvedValue(shellStatus("error"));
    const store = new EngineStore();
    await store.refresh();

    await store.pauseEngine();

    expect(engineApi.pause).not.toHaveBeenCalled();
    expect(store.busy).toBeNull();
  });

  it("keeps the autostart failure visible and retries the same target", async () => {
    vi.mocked(engineApi.setAutostart).mockRejectedValue(
      new Error("registry denied"),
    );
    const store = new EngineStore();

    await store.setAutostart(true);

    expect(store.autostartError).toContain("registry denied");
    expect(store.error).toContain("registry denied");

    vi.mocked(engineApi.setAutostart).mockResolvedValue(shellStatus("paused"));
    await store.retryAutostart();

    expect(engineApi.setAutostart).toHaveBeenLastCalledWith(true);
    expect(store.autostartError).toBeNull();
  });
});
