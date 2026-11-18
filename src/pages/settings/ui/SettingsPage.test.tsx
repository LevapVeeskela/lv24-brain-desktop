import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { SettingsStore } from "@/entities/settings/model/SettingsStore";
import type { HookStatus } from "@/pages/settings/api/hooksApi";
import { renderPage } from "@/test/render";
import { HooksStore } from "../model/HooksStore";
import { SettingsPage } from "./SettingsPage";

function hook(overrides: Partial<HookStatus> = {}): HookStatus {
  return {
    host: "claude",
    path: "~/.claude/settings.json",
    installed: true,
    detail: "Stop hook",
    trusted: true,
    trustDrift: false,
    lastRun: "2026-11-18T06:00:00Z",
    ...overrides,
  };
}

describe("SettingsPage hooks", () => {
  it("lists host trust, last run and last error with a copyable sync hint", () => {
    const hooks = new HooksStore({
      list: async () => [hook()],
    });
    hooks.items = [
      hook(),
      hook({
        host: "codex",
        path: "~/.codex/config.toml",
        installed: false,
        trusted: null,
        trustDrift: true,
        lastRun: null,
        lastError: "exit 1",
      }),
    ];
    hooks.loaded = true;
    const html = renderPage(
      <SettingsPage
        engine={new EngineStore()}
        settings={new SettingsStore()}
        hooks={hooks}
      />,
    );
    expect(html).toContain("Agent hooks");
    expect(html).toContain("brain agents sync --hooks");
    expect(html).toContain("Copy command");
    expect(html).toContain("Installed");
    expect(html).toContain("Not installed");
    expect(html).toContain("Trusted");
    expect(html).toContain("Trust unknown");
    expect(html).toContain("Trust changed");
    expect(html).toContain("Last run");
    expect(html).toContain("Never ran");
    expect(html).toContain("Last error");
    expect(html).toContain("exit 1");
  });
});
