import { describe, expect, it } from "vitest";
import type { ProviderDescriptor } from "@/entities/provider/model/types";
import { validateWizard } from "./validation";

const provider: ProviderDescriptor = {
  provider: "github",
  displayName: "GitHub",
  capabilities: {
    backfill: true,
    incremental: true,
    deletes: false,
    authModes: ["token", "oauth-device"],
    actions: false,
  },
  defaultPublish: "shared",
  configFields: [
    { key: "repos", label: "Repositories", required: true, secret: false },
    { key: "token", label: "Token", required: true, secret: true },
    { key: "endpoint", label: "Endpoint", required: false, secret: false },
  ],
  backends: ["native"],
  streams: ["github"],
};

function input(overrides: Partial<Parameters<typeof validateWizard>[0]> = {}) {
  return {
    id: "github-main",
    provider,
    settings: { repos: "lv24/brain" },
    secrets: { token: "secret" },
    oauth: false,
    schedule: "manual" as const,
    customSchedule: "",
    ...overrides,
  };
}

describe("wizard validation", () => {
  it("accepts a complete draft", () => {
    expect(validateWizard(input())).toMatchObject({
      valid: true,
      id: null,
      missingSettings: [],
      missingSecrets: [],
      customScheduleInvalid: false,
    });
  });

  it("reports an empty or malformed id separately", () => {
    expect(validateWizard(input({ id: "  " })).id).toBe("empty");
    expect(validateWizard(input({ id: "GitHub Main" })).id).toBe("invalid");
  });

  it("lists missing required settings and secrets", () => {
    const result = validateWizard(
      input({ settings: {}, secrets: { token: " " } }),
    );
    expect(result.valid).toBe(false);
    expect(result.missingSettings).toEqual(["repos"]);
    expect(result.missingSecrets).toEqual(["token"]);
  });

  it("does not require secrets for OAuth providers", () => {
    const result = validateWizard(
      input({ oauth: true, secrets: {}, settings: { repos: "lv24/brain" } }),
    );
    expect(result.valid).toBe(true);
    expect(result.missingSecrets).toEqual([]);
  });

  it("rejects an empty custom schedule", () => {
    const result = validateWizard(input({ schedule: "custom" }));
    expect(result.valid).toBe(false);
    expect(result.customScheduleInvalid).toBe(true);
  });

  it("accepts a custom schedule with a value", () => {
    const result = validateWizard(
      input({ schedule: "custom", customSchedule: "@every 1h" }),
    );
    expect(result.valid).toBe(true);
    expect(result.customScheduleInvalid).toBe(false);
  });
});
