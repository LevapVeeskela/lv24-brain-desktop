import { describe, expect, it } from "vitest";
import { proposalDecisionBody, recordEditBody } from "./memoryApi";

describe("memory API wire mapping", () => {
  it("maps the record edit draft to the snake_case contract", () => {
    expect(
      recordEditBody({
        title: "Title",
        body: "Body",
        tags: ["one", "two"],
        expectedUpdatedAt: "2026-11-16T05:30:00Z",
        allowDuplicate: true,
      }),
    ).toEqual({
      title: "Title",
      body: "Body",
      tags: ["one", "two"],
      expected_updated_at: "2026-11-16T05:30:00Z",
      allow_duplicate: true,
    });
    expect(recordEditBody({ body: "Only body" })).toEqual({
      title: undefined,
      body: "Only body",
      tags: undefined,
      expected_updated_at: undefined,
      allow_duplicate: undefined,
    });
  });

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
