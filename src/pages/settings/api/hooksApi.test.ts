import { describe, expect, it } from "vitest";
import { parseHookStatus, parseHookStatuses } from "./hooksApi";

describe("hooks parser", () => {
  it("maps host, trust and last run values", () => {
    expect(
      parseHookStatus(
        {
          host: "claude",
          path: "~/.claude/settings.json",
          installed: true,
          detail: "Stop hook",
          trusted: false,
          trust: "manual",
          trust_hash: "sha256:abc",
          trust_drift: true,
          approve: "brain agents sync --hooks --approve claude",
          last_run: "2026-11-18T06:00:00Z",
          last_event: "Stop",
          last_error: "exit 1",
          unknown: "dropped",
        },
        "hooks[0]",
      ),
    ).toEqual({
      host: "claude",
      path: "~/.claude/settings.json",
      installed: true,
      detail: "Stop hook",
      trusted: false,
      trust: "manual",
      trustHash: "sha256:abc",
      trustDrift: true,
      approve: "brain agents sync --hooks --approve claude",
      lastRun: "2026-11-18T06:00:00Z",
      lastEvent: "Stop",
      lastError: "exit 1",
    });
  });

  it("keeps an unknown trust and a never-run host as null", () => {
    const [status] = parseHookStatuses([
      {
        host: "codex",
        path: "~/.codex/config.toml",
        installed: false,
        detail: "not configured",
        trusted: null,
        last_run: null,
      },
    ]);
    expect(status.trusted).toBeNull();
    expect(status.lastRun).toBeNull();
    expect(status.trustDrift).toBe(false);
  });

  it("rejects a non-array response and invalid booleans or timestamps", () => {
    expect(() => parseHookStatuses({})).toThrow(/array/);
    expect(() =>
      parseHookStatus(
        { host: "x", path: "p", installed: "yes", detail: "d" },
        "hook",
      ),
    ).toThrow(/installed/);
    expect(() =>
      parseHookStatus(
        {
          host: "x",
          path: "p",
          installed: true,
          detail: "d",
          last_run: "not a time",
        },
        "hook",
      ),
    ).toThrow(/last_run/);
  });
});
