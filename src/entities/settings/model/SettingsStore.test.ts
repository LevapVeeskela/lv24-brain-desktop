import { beforeEach, describe, expect, it, vi } from "vitest";

const listenMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("../api/settingsApi", () => ({
  settingsApi: {
    checkUpdate: vi.fn(),
    installUpdate: vi.fn(),
    secretNames: vi.fn(),
  },
}));

import { settingsApi } from "../api/settingsApi";
import type { UpdateProgress } from "./types";
import { SettingsStore } from "./SettingsStore";

type ProgressHandler = (event: { payload: UpdateProgress }) => void;

describe("SettingsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenMock.mockResolvedValue(vi.fn());
  });

  it("tracks download progress and switches to restarting at 100%", async () => {
    let finishInstall: () => void = () => undefined;
    vi.mocked(settingsApi.installUpdate).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInstall = resolve;
        }),
    );
    const store = new SettingsStore();

    const installing = store.installUpdate();
    await vi.waitFor(() => {
      expect(settingsApi.installUpdate).toHaveBeenCalledTimes(1);
    });

    const handler = listenMock.mock.calls[0]?.[1] as ProgressHandler;
    expect(listenMock).toHaveBeenCalledWith(
      "update-progress",
      expect.any(Function),
    );

    handler({ payload: { downloaded: 50, total: 200 } });
    expect(store.updatePercent).toBe(25);
    expect(store.updateStage).toBe("downloading");

    handler({ payload: { downloaded: 199, total: 200 } });
    expect(store.updatePercent).toBe(99);
    expect(store.updateStage).toBe("downloading");

    handler({ payload: { downloaded: 200, total: 200 } });
    expect(store.updatePercent).toBe(100);
    expect(store.updateStage).toBe("restarting");

    finishInstall();
    await installing;

    expect(store.installingUpdate).toBe(false);
    expect(store.updateProgress).toBeNull();
    expect(store.restartPending).toBe(true);
    expect(store.updateStage).toBe("restarting");
  });

  it("floors fractional percentages instead of rounding up to 100", async () => {
    vi.mocked(settingsApi.installUpdate).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const store = new SettingsStore();
    void store.installUpdate();
    await vi.waitFor(() => {
      expect(listenMock).toHaveBeenCalledTimes(1);
    });

    const handler = listenMock.mock.calls[0]?.[1] as ProgressHandler;
    handler({ payload: { downloaded: 1999, total: 2000 } });
    expect(store.updatePercent).toBe(99);
    expect(store.updateStage).toBe("downloading");
    store.dispose();
  });

  it("reports install failures and removes the progress listener", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValue(unlisten);
    vi.mocked(settingsApi.installUpdate).mockRejectedValue(
      new Error("installer failed"),
    );
    const store = new SettingsStore();

    await store.installUpdate();

    expect(store.installingUpdate).toBe(false);
    expect(store.errorKind).toBe("install");
    expect(store.error).toContain("installer failed");
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("cleans up a listener that resolves after the install already failed", async () => {
    const unlisten = vi.fn();
    let resolveListen: ((value: () => void) => void) | undefined;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );
    vi.mocked(settingsApi.installUpdate).mockRejectedValue(
      new Error("installer failed"),
    );
    const store = new SettingsStore();

    await store.installUpdate();
    expect(store.errorKind).toBe("install");
    expect(unlisten).not.toHaveBeenCalled();

    resolveListen?.(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("unsubscribes when disposed before the listener resolves", async () => {
    const unlisten = vi.fn();
    let resolveListen: ((value: () => void) => void) | undefined;
    listenMock.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );
    vi.mocked(settingsApi.installUpdate).mockImplementation(
      () => new Promise<void>(() => undefined),
    );
    const store = new SettingsStore();
    void store.installUpdate();
    await vi.waitFor(() => expect(listenMock).toHaveBeenCalledTimes(1));

    store.dispose();
    resolveListen?.(unlisten);
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });

  it("labels check failures separately from install failures", async () => {
    vi.mocked(settingsApi.checkUpdate).mockRejectedValue(
      new Error("network down"),
    );
    const store = new SettingsStore();

    await store.checkUpdate();

    expect(store.errorKind).toBe("check");
    expect(store.error).toContain("network down");
    store.dismissError();
    expect(store.errorKind).toBeNull();
    expect(store.error).toBeNull();
  });
});
