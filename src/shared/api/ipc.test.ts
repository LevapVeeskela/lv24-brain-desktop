import { describe, expect, it, vi } from "vitest";
import { isMissingOriginError, recoverMissingOriginIpc } from "./ipc";

function fakeStorage() {
  let value: string | null = null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}

describe("Tauri IPC recovery", () => {
  it("recognizes the missing-Origin error shape", () => {
    expect(isMissingOriginError(new Error("missing Origin header"))).toBe(true);
    expect(isMissingOriginError("missing Origin header")).toBe(true);
    expect(isMissingOriginError(new Error("shell offline"))).toBe(false);
  });

  it("reloads once per webview session", () => {
    const storage = fakeStorage();
    const reload = vi.fn();

    expect(
      recoverMissingOriginIpc(new Error("missing Origin header"), {
        storage,
        reload,
      }),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(
      recoverMissingOriginIpc(new Error("missing Origin header"), {
        storage,
        reload,
      }),
    ).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads for an unrelated command error", () => {
    const reload = vi.fn();
    expect(
      recoverMissingOriginIpc(new Error("engine_start failed"), {
        storage: fakeStorage(),
        reload,
      }),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
