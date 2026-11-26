import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import {
  dayDifference,
  daysOverdue,
  dueChip,
  dueInputs,
  endOfLocalWeek,
  formatIdeaDue,
  formatLeadParts,
  ideaDueDay,
  ideaSourceText,
  isIdeaDueToday,
  isIdeaOverdue,
  localDateKey,
  localDateTimeToIso,
  parseLocalDateKey,
} from "./format";

// Friday, 2026-11-27, noon local time.
const now = new Date(2026, 10, 27, 12, 0, 0, 0);

describe("idea date helpers", () => {
  it("reads and writes local calendar dates without UTC shifts", () => {
    expect(localDateKey(new Date(2026, 10, 27, 23, 59))).toBe("2026-11-27");
    const parsed = parseLocalDateKey("2026-11-27");
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(27);
    expect(parsed?.getHours()).toBe(0);
    expect(parseLocalDateKey("2026-02-31")).toBeNull();
    expect(parseLocalDateKey("27.11.2026")).toBeNull();
    expect(dayDifference(new Date(2026, 10, 29), now)).toBe(2);
    expect(endOfLocalWeek(now).getDate()).toBe(29);
  });

  it("groups timed and all-day ideas by their local due day", () => {
    const timed = ideaFixture({ dueAt: new Date(2026, 10, 27, 18, 0).toISOString() });
    const allDay = ideaFixture({ dueDate: "2026-11-27" });
    expect(ideaDueDay(timed)?.getHours()).toBe(0);
    expect(ideaDueDay(allDay)?.getDate()).toBe(27);
    expect(isIdeaDueToday(timed, now)).toBe(true);
    expect(isIdeaDueToday(allDay, now)).toBe(true);
    expect(isIdeaOverdue(timed, now)).toBe(false);
    const overdue = ideaFixture({ dueDate: "2026-11-25" });
    expect(isIdeaOverdue(overdue, now)).toBe(true);
    expect(daysOverdue(overdue, now)).toBe(2);
  });

  it("treats a timed item due earlier today as today, not overdue", () => {
    const earlier = ideaFixture({
      dueAt: new Date(2026, 10, 27, 9, 0).toISOString(),
    });
    expect(isIdeaOverdue(earlier, new Date(2026, 10, 27, 20, 0))).toBe(false);
  });

  it("builds the dense due chip for every bucket", () => {
    expect(
      dueChip(ideaFixture({ dueDate: "2026-11-25" }), now, "en"),
    ).toEqual({ kind: "overdue", days: 2 });
    expect(
      dueChip(
        ideaFixture({ dueAt: new Date(2026, 10, 27, 18, 0).toISOString() }),
        now,
        "en",
      ),
    ).toEqual({ kind: "time", time: "18:00" });
    expect(dueChip(ideaFixture({ dueDate: "2026-11-27" }), now, "en")).toEqual({
      kind: "allDay",
    });
    expect(dueChip(ideaFixture({ dueDate: "2026-11-29" }), now, "en")).toEqual({
      kind: "weekday",
      label: "Sun",
    });
    expect(dueChip(ideaFixture({ dueDate: "2026-12-10" }), now, "en")).toEqual({
      kind: "date",
      label: "Dec 10",
    });
    expect(
      dueChip(
        ideaFixture({ dueAt: new Date(2026, 11, 10, 18, 0).toISOString() }),
        now,
        "en",
      ),
    ).toEqual({ kind: "date", label: "Dec 10, 18:00" });
    expect(dueChip(ideaFixture(), now, "en")).toBeNull();
  });

  it("formats the full due timestamp and source line", () => {
    const timed = ideaFixture({
      dueAt: new Date(2026, 10, 27, 18, 0).toISOString(),
    });
    expect(formatIdeaDue(timed, "en")).toContain("Nov");
    expect(formatIdeaDue(ideaFixture({ dueDate: "2026-11-27" }), "en")).toContain(
      "2026",
    );
    expect(formatIdeaDue(ideaFixture(), "en")).toBeNull();
    expect(
      ideaSourceText(
        ideaFixture({
          source: { type: "session", id: "ses_1", harness: "opencode" },
        }),
      ),
    ).toBe("session · opencode · ses_1");
    expect(ideaSourceText(ideaFixture())).toBeNull();
  });

  it("splits reminder leads into translatable units", () => {
    expect(formatLeadParts(0)).toBeNull();
    expect(formatLeadParts(30)).toEqual({ count: 30, unit: "minute" });
    expect(formatLeadParts(120)).toEqual({ count: 2, unit: "hour" });
    expect(formatLeadParts(1440)).toEqual({ count: 1, unit: "day" });
    expect(formatLeadParts(90)).toEqual({ count: 90, unit: "minute" });
    expect(formatLeadParts(2880)).toEqual({ count: 2, unit: "day" });
  });

  it("round-trips the drawer date/time inputs with a real offset", () => {
    expect(dueInputs(ideaFixture({ dueDate: "2026-11-27" }))).toEqual({
      date: "2026-11-27",
      time: "",
    });
    const timed = ideaFixture({
      dueAt: new Date(2026, 10, 27, 18, 30).toISOString(),
    });
    expect(dueInputs(timed)).toEqual({ date: "2026-11-27", time: "18:30" });

    const iso = localDateTimeToIso("2026-11-27", "18:00");
    expect(iso).toMatch(/^2026-11-27T18:00:00[+-]\d{2}:\d{2}$/);
    const parsed = new Date(iso as string);
    expect(parsed.getHours()).toBe(18);
    expect(parsed.getMinutes()).toBe(0);
    expect(localDateTimeToIso("2026-11-27", "")).toBeNull();
    expect(localDateTimeToIso("not-a-date", "18:00")).toBeNull();
    expect(localDateTimeToIso("2026-11-27", "25:00")).toBeNull();
  });
});
