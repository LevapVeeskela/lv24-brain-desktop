import { describe, expect, it } from "vitest";
import { parseDigest } from "./digest";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: "2026-11-18T06:00:00Z",
    since: "2026-11-17T06:00:00Z",
    dry_run: true,
    projects: [
      {
        project: {
          id: "lv24",
          name: "LV24",
          paths: ["C:\\0project\\lv24"],
          path_provenance: { "C:\\0project\\lv24": "DESKTOP-F5INSH6" },
        },
        changes: 4,
        notes: 2,
        decisions: 1,
        attempts: 1,
        handoffs: 1,
        commits: 3,
        latest_handoff: {
          id: "ho-1",
          summary: "Ship 0.25",
          next_action: "Write release notes",
          created_at: "2026-11-17T22:00:00Z",
        },
        proposed_decisions: [{ id: "pd-1", title: "Use FTS5" }],
        open_questions: ["Which theme?"],
        blocked: ["npm token"],
        findings: { stale: 2 },
      },
    ],
    unknown: "dropped",
    ...overrides,
  };
}

describe("digest parser", () => {
  it("maps the digest to camelCase and keeps per-project counts", () => {
    expect(parseDigest(payload())).toEqual({
      generatedAt: "2026-11-18T06:00:00Z",
      since: "2026-11-17T06:00:00Z",
      dryRun: true,
      projects: [
        {
          project: {
            id: "lv24",
            name: "LV24",
            paths: ["C:\\0project\\lv24"],
            pathProvenance: { "C:\\0project\\lv24": "DESKTOP-F5INSH6" },
          },
          changes: 4,
          notes: 2,
          decisions: 1,
          attempts: 1,
          handoffs: 1,
          commits: 3,
          latestHandoff: {
            id: "ho-1",
            summary: "Ship 0.25",
            nextAction: "Write release notes",
            createdAt: "2026-11-17T22:00:00Z",
          },
          proposedDecisions: [{ id: "pd-1", title: "Use FTS5" }],
          openQuestions: ["Which theme?"],
          blocked: ["npm token"],
          findings: { stale: 2 },
        },
      ],
    });
  });

  it("reads a written digest and an optional handoff", () => {
    const parsed = parseDigest(
      payload({
        dry_run: false,
        written_to: "digests/2026-11-18.md",
        projects: [
          {
            ...(payload().projects as Record<string, unknown>[])[0],
            latest_handoff: undefined,
            findings: undefined,
          },
        ],
      }),
    );
    expect(parsed.dryRun).toBe(false);
    expect(parsed.writtenTo).toBe("digests/2026-11-18.md");
    expect(parsed.projects[0].latestHandoff).toBeUndefined();
    expect(parsed.projects[0].findings).toBeUndefined();
  });

  it("rejects a malformed timestamp, a non-boolean flag and a bad count", () => {
    expect(() => parseDigest(payload({ generated_at: "yesterday" }))).toThrow(
      /generated_at/,
    );
    expect(() => parseDigest(payload({ dry_run: "yes" }))).toThrow(/dry_run/);
    const project = (payload().projects as Record<string, unknown>[])[0];
    expect(() =>
      parseDigest(payload({ projects: [{ ...project, changes: "many" }] })),
    ).toThrow(/changes/);
    expect(() =>
      parseDigest(
        payload({ projects: [{ ...project, proposed_decisions: "none" }] }),
      ),
    ).toThrow(/proposed_decisions/);
  });
});
