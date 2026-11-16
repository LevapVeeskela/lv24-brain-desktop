import { describe, expect, it } from "vitest";
import { proposalDecisionBody } from "./memoryApi";

describe("memory API wire mapping", () => {
  it("maps camelCase proposal decisions to the snake_case contract", () => {
    expect(
      proposalDecisionBody({
        as: "decision",
        status: "proposed",
        title: "Title",
        force: true,
        yes: true,
        allowDuplicate: true,
        allowProtected: true,
        dryRun: true,
      }),
    ).toEqual({
      as: "decision",
      status: "proposed",
      title: "Title",
      force: true,
      yes: true,
      allow_duplicate: true,
      allow_protected: true,
      dry_run: true,
    });
  });
});
