import { describe, expect, it } from "vitest";
import { ProviderDrafts, type WizardDraft } from "./draft";

function draft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    id: "github-main",
    account: "work",
    baseUrl: "",
    authMode: "token",
    backend: "native",
    schedule: "manual",
    customSchedule: "",
    publish: "local-only",
    selectedProjects: ["lv24"],
    settings: { repos: "lv24/brain" },
    secrets: { token: "secret" },
    ...overrides,
  };
}

describe("ProviderDrafts", () => {
  it("restores a draft for the same provider", () => {
    const drafts = new ProviderDrafts();
    drafts.write("github", draft());

    expect(drafts.read("github")).toEqual(draft());
    expect(drafts.read("gitlab")).toBeUndefined();
  });

  it("keeps drafts isolated per provider", () => {
    const drafts = new ProviderDrafts();
    drafts.write("github", draft());
    drafts.write("gitlab", draft({ id: "gitlab-main", settings: { host: "x" } }));

    expect(drafts.read("github")?.settings).toEqual({ repos: "lv24/brain" });
    expect(drafts.read("gitlab")?.settings).toEqual({ host: "x" });
    expect(drafts.size).toBe(2);
  });

  it("does not expose internal state through returned copies", () => {
    const drafts = new ProviderDrafts();
    const original = draft();
    drafts.write("github", original);
    original.settings.repos = "changed-after-write";

    const restored = drafts.read("github");
    expect(restored?.settings.repos).toBe("lv24/brain");
    if (restored) {
      restored.secrets.token = "changed-after-read";
    }
    expect(drafts.read("github")?.secrets.token).toBe("secret");
  });

  it("can forget a provider draft", () => {
    const drafts = new ProviderDrafts();
    drafts.write("github", draft());
    drafts.delete("github");
    expect(drafts.read("github")).toBeUndefined();
  });
});
