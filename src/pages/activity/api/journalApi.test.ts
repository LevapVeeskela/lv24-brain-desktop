import { describe, expect, it } from "vitest";
import { parseJournalEntry, parseJournalPage } from "./journalApi";

describe("journal parser", () => {
  it("maps a page and keeps the newest-first entries", () => {
    expect(
      parseJournalPage({
        items: [
          {
            time: "2026-11-18T06:00:00Z",
            event: "note",
            project: "lv24",
            id: "note-1",
            title: "Release notes",
            fields: { kind: "note" },
            unknown: "dropped",
          },
        ],
        limit: 50,
        has_more: true,
        unknown: "dropped",
      }),
    ).toEqual({
      items: [
        {
          time: "2026-11-18T06:00:00Z",
          event: "note",
          project: "lv24",
          id: "note-1",
          title: "Release notes",
          fields: { kind: "note" },
        },
      ],
      limit: 50,
      hasMore: true,
    });
  });

  it("accepts an entry without optional fields", () => {
    expect(
      parseJournalEntry(
        { time: "2026-11-18T06:00:00Z", event: "sync" },
        "journal.items[0]",
      ),
    ).toEqual({ time: "2026-11-18T06:00:00Z", event: "sync" });
  });

  it("rejects a bad timestamp, a missing event and a non-boolean flag", () => {
    expect(() =>
      parseJournalEntry({ time: "soon", event: "note" }, "entry"),
    ).toThrow(/time/);
    expect(() =>
      parseJournalEntry({ time: "2026-11-18T06:00:00Z" }, "entry"),
    ).toThrow(/event/);
    expect(() =>
      parseJournalPage({ items: [], limit: 50, has_more: "yes" }),
    ).toThrow(/has_more/);
  });
});
