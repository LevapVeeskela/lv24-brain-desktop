import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import { createFakeIdeaExportSource } from "../api/fakeIdeaExport";
import { exportIdeasIcs } from "./export";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

describe("idea calendar export", () => {
  it("fetches the text and saves it under the local date name", async () => {
    const saved: Array<{ fileName: string; text: string }> = [];
    const text = await exportIdeasIcs({
      source: { fetchIcs: async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" },
      now: () => now,
      save: (fileName, value) => saved.push({ fileName, text: value }),
    });
    expect(text).toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(saved).toEqual([
      {
        fileName: "ideas-2026-11-27.ics",
        text: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      },
    ]);
  });

  it("propagates a source failure without saving a partial file", async () => {
    const saved: string[] = [];
    await expect(
      exportIdeasIcs({
        source: {
          fetchIcs: async () => {
            throw new Error("engine offline");
          },
        },
        now: () => now,
        save: (fileName) => saved.push(fileName),
      }),
    ).rejects.toThrow("engine offline");
    expect(saved).toEqual([]);
  });

  it("builds a deterministic fake calendar from the injected clock and ideas", async () => {
    const source = createFakeIdeaExportSource({
      now: () => now,
      ideas: () => [
        ideaFixture({
          title: "Injected",
          dueDate: "2026-11-28",
          projectId: "personal",
        }),
      ],
    });
    const ics = await source.fetchIcs();
    expect(ics).toContain("SUMMARY:Injected");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261128");
    expect(ics).toContain("CATEGORIES:personal");
  });

  it("exports an empty calendar when no ideas are injected", async () => {
    const ics = await createFakeIdeaExportSource({ now: () => now }).fetchIcs();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
