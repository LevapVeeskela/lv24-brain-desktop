import { describe, expect, it } from "vitest";
import { renderPage } from "@/test/render";
import { JournalStore } from "../model/JournalStore";
import { JournalPanel } from "./JournalPanel";

function journalStore(): JournalStore {
  const journal = new JournalStore({
    read: async () => ({ items: [], limit: 50, hasMore: false }),
  });
  journal.projectId = "lv24";
  journal.items = [
    {
      time: "2026-11-18T06:00:00Z",
      event: "note",
      project: "lv24",
      id: "note-1",
      title: "Release notes",
    },
    {
      time: "2026-11-18T05:00:00Z",
      event: "sync",
      project: "lv24",
    },
  ];
  journal.limit = 50;
  journal.hasMore = true;
  journal.loaded = true;
  return journal;
}

describe("ActivityPage journal", () => {
  it("renders time, event and id/title with load more", () => {
    const html = renderPage(
      <JournalPanel projectId="lv24" journal={journalStore()} />,
    );
    expect(html).toContain("Journal");
    expect(html).toContain("Newest first, limit 50.");
    expect(html).toContain(">Time<");
    expect(html).toContain(">Event<");
    expect(html).toContain(">ID / title<");
    expect(html).toContain('dateTime="2026-11-18T06:00:00Z"');
    expect(html).toContain("Release notes");
    expect(html).toContain("note-1");
    expect(html).toContain("sync");
    expect(html).toContain("Load more");
  });

  it("asks for a project when the scope is empty", () => {
    const html = renderPage(
      <JournalPanel projectId={null} journal={journalStore()} />,
    );
    expect(html).toContain("Select a project to read its journal.");
  });
});
