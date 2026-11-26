import { describe, expect, it } from "vitest";
import type { Idea } from "@/entities/ideas/model/types";
import { ideaFixture } from "@/test/fixtures";
import {
  buildIdeasIcs,
  escapeIcsText,
  foldIcsLine,
  icsFileName,
} from "./ics";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function utc(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function timedIdea(overrides: Partial<Idea> = {}): Idea {
  return ideaFixture({
    title: "Timed idea",
    dueAt: new Date(2026, 10, 27, 18, 0, 0, 0).toISOString(),
    remindBeforeMinutes: 120,
    ...overrides,
  });
}

function allDayIdea(overrides: Partial<Idea> = {}): Idea {
  return ideaFixture({
    title: "All day idea",
    dueDate: "2026-11-28",
    ...overrides,
  });
}

function linesOf(ics: string): string[] {
  return ics.split("\r\n");
}

describe("ICS export", () => {
  it("writes CRLF-terminated VCALENDAR with a stable DTSTAMP", () => {
    const ics = buildIdeasIcs([timedIdea()], now);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//LV24 Brain//Ideas//EN");
    expect(ics).toContain(`DTSTAMP:${utc(now)}`);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(linesOf(ics).at(-2)).toBe("END:VCALENDAR");
  });

  it("exports timed ideas as UTC DATE-TIME with a relative alarm", () => {
    const idea = timedIdea();
    const ics = buildIdeasIcs([idea], now);
    const due = new Date(idea.dueAt ?? "");
    expect(ics).toContain(`DTSTART:${utc(due)}`);
    expect(ics).toContain("SUMMARY:Timed idea");
    expect(ics).toContain("TRIGGER:-PT120M");
    expect(ics).toContain("ACTION:DISPLAY");
    expect(ics).not.toContain("DTSTART;VALUE=DATE");
  });

  it("exports all-day ideas as DATE with an absolute 09:00-anchored alarm", () => {
    const ics = buildIdeasIcs([allDayIdea({ remindBeforeMinutes: 120 })], now);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261128");
    expect(ics).toContain("DTEND;VALUE=DATE:20261129");
    const anchor = new Date(2026, 10, 28, 9, 0, 0, 0);
    anchor.setMinutes(anchor.getMinutes() - 120);
    expect(ics).toContain(`TRIGGER;VALUE=DATE-TIME:${utc(anchor)}`);
    expect(ics).not.toContain("TRIGGER:-PT120M");
  });

  it("omits the alarm when no lead is stored", () => {
    const ics = buildIdeasIcs(
      [timedIdea({ remindBeforeMinutes: 0 }), allDayIdea()],
      now,
    );
    expect(ics).not.toContain("BEGIN:VALARM");
  });

  it("exports only open, dated ideas and sorts them by due time", () => {
    const ideas = [
      allDayIdea({ title: "Second", dueDate: "2026-11-30" }),
      timedIdea({ title: "First" }),
      ideaFixture({ title: "Done", dueDate: "2026-11-28", status: "done" }),
      ideaFixture({ title: "Dropped", dueDate: "2026-11-28", status: "dropped" }),
      ideaFixture({ title: "Someday", dueDate: "2026-11-28", status: "someday" }),
      ideaFixture({ title: "Undated" }),
    ];
    const ics = buildIdeasIcs(ideas, now);
    expect(ics).toContain("SUMMARY:First");
    expect(ics).toContain("SUMMARY:Second");
    expect(ics).not.toContain("SUMMARY:Done");
    expect(ics).not.toContain("SUMMARY:Dropped");
    expect(ics).not.toContain("SUMMARY:Someday");
    expect(ics).not.toContain("SUMMARY:Undated");
    expect(ics.indexOf("SUMMARY:First")).toBeLessThan(
      ics.indexOf("SUMMARY:Second"),
    );
    expect(ics).toContain("CATEGORIES:lv24");
  });

  it("escapes separators, backslashes and newlines", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = buildIdeasIcs(
      [timedIdea({ title: "Plan, review; done", body: "Line 1\nLine 2" })],
      now,
    );
    expect(ics).toContain("SUMMARY:Plan\\, review\\; done");
    expect(ics).toContain("DESCRIPTION:Line 1\\nLine 2");
  });

  it("folds long content lines at 75 UTF-8 octets without splitting glyphs", () => {
    const original = `SUMMARY:${"я".repeat(100)}`;
    const folded = foldIcsLine(original);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(folded.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    const unfolded =
      folded[0] + folded.slice(1).map((line) => line.slice(1)).join("");
    expect(unfolded).toBe(original);

    const ics = buildIdeasIcs([timedIdea({ title: "я".repeat(150) })], now);
    for (const line of linesOf(ics)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("names the file by the local export date", () => {
    expect(icsFileName(now)).toBe("ideas-2026-11-27.ics");
  });
});
