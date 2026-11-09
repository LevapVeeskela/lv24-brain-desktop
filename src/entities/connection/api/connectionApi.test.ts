import { describe, expect, it } from "vitest";
import { parseConnections, parseRuns } from "./connectionApi";

describe("local API response parsing", () => {
  it("parses a connection list without leaking unknown fields", () => {
    const parsed = parseConnections([
      {
        id: "github-main",
        provider: "github",
        backend: "native",
        account: "octocat",
        projects: ["lv24"],
        schedule: "@daily",
        publish: "local-only",
        settings: { base_url: "https://api.github.com" },
        secret: "must not survive",
      },
    ]);
    expect(parsed).toEqual([
      {
        id: "github-main",
        provider: "github",
        backend: "native",
        account: "octocat",
        baseUrl: undefined,
        projects: ["lv24"],
        schedule: "@daily",
        publish: "local-only",
        settings: { base_url: "https://api.github.com" },
      },
    ]);
  });

  it("rejects malformed connection responses", () => {
    expect(() => parseConnections({})).toThrow(/non-array/);
    expect(() => parseConnections([{ provider: "github" }])).toThrow(/id/);
    expect(() => parseConnections([{ id: "x" }])).toThrow(/provider/);
    expect(() =>
      parseConnections([{ id: "x", provider: "github", backend: "magic" }]),
    ).toThrow(/enum/);
  });

  it("parses runs and their stats", () => {
    const runs = parseRuns([
      {
        id: "github-main-1",
        source: "github",
        connectionId: "github-main",
        status: "success",
        startedAt: "2026-11-09T18:00:00Z",
        finishedAt: "2026-11-09T18:00:04Z",
        counts: { items: 12 },
        stats: {
          seen: 12,
          upserted: 3,
          unchanged: 9,
          deleted: 0,
          skipped: 0,
          batches: 1,
        },
      },
    ]);
    expect(runs[0]?.stats?.upserted).toBe(3);
    expect(runs[0]?.counts).toEqual({ items: 12 });
    expect(() => parseRuns([{ id: "x", source: "y", startedAt: "z", status: "wat" }])).toThrow(
      /unknown run status/,
    );
  });
});
