import { afterAll, describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import {
  addLocalDays,
  buildMonthGrid,
  calendarAgenda,
  calendarDragReducer,
  calendarFocusKey,
  calendarMonth,
  formatCalendarDate,
  groupCalendarWeeks,
  IDLE_CALENDAR_DRAG,
  localDay,
  monthBounds,
  monthGridDays,
  reschedulePatch,
  shiftCalendarMonth,
  weekdayLabels,
} from "./calendar";
import { localDateKey } from "./format";

// DST tests need a zone with real transitions; restore the machine zone after.
const originalTz = process.env.TZ;
process.env.TZ = "America/New_York";

afterAll(() => {
  if (originalTz === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTz;
  }
});

// Friday, 2026-11-27, noon in the injected zone.
const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function timed(dayOffset: number, hour: number, minute = 0, title = "Timed") {
  return ideaFixture({
    title,
    dueAt: new Date(
      2026,
      10,
      27 + dayOffset,
      hour,
      minute,
      0,
      0,
    ).toISOString(),
  });
}

describe("calendar grid", () => {
  it("builds a Monday-first six-week grid with leading and trailing days", () => {
    const days = monthGridDays(2026, 10);
    expect(days).toHaveLength(42);
    expect(localDateKey(days[0])).toBe("2026-10-26");
    expect(localDateKey(days[41])).toBe("2026-12-06");

    const weeks = groupCalendarWeeks(
      buildMonthGrid(2026, 10, [], now),
    );
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);

    const cells = buildMonthGrid(2026, 10, [], now);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(cells.find((cell) => cell.key === "2026-11-01")?.inMonth).toBe(true);
    expect(cells.find((cell) => cell.key === "2026-10-31")?.inMonth).toBe(false);
    expect(cells.find((cell) => cell.key === "2026-11-27")?.isToday).toBe(true);
    expect(cells.filter((cell) => cell.isToday)).toHaveLength(1);
  });

  it("handles leap years and month boundaries", () => {
    const leap = monthGridDays(2028, 1);
    expect(localDateKey(leap[0])).toBe("2028-01-31");
    expect(leap.map(localDateKey)).toContain("2028-02-29");
    expect(localDateKey(leap[41])).toBe("2028-03-12");

    const december = monthGridDays(2026, 11);
    expect(localDateKey(december[0])).toBe("2026-11-30");
    expect(localDateKey(december[41])).toBe("2027-01-10");
    expect(monthBounds(2026, 11)).toEqual({
      firstKey: "2026-12-01",
      lastKey: "2026-12-31",
    });

    expect(shiftCalendarMonth({ year: 2026, month: 11 }, 1)).toEqual({
      year: 2027,
      month: 0,
    });
    expect(shiftCalendarMonth({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    });
    expect(calendarMonth(new Date(2026, 10, 27))).toEqual({
      year: 2026,
      month: 10,
    });
  });

  it("advances local days across DST without 24-hour assumptions", () => {
    // DST starts on 2026-03-08 in America/New_York: 02:00 -> 03:00.
    const saturday = localDay(2026, 2, 7);
    const monday = addLocalDays(saturday, 2);
    expect(localDateKey(monday)).toBe("2026-03-09");
    const sunday = localDay(2026, 2, 8);
    expect(sunday.getTime() - saturday.getTime()).toBe(24 * 3_600_000);
    expect(monday.getTime() - sunday.getTime()).toBe(23 * 3_600_000);

    const keys = monthGridDays(2026, 2).map(localDateKey);
    const index = keys.indexOf("2026-03-08");
    expect(index).toBeGreaterThan(0);
    expect(keys[index + 1]).toBe("2026-03-09");
    expect(keys.slice(0, 42)).toEqual(
      Array.from({ length: 42 }, (_, offset) =>
        localDateKey(addLocalDays(localDay(2026, 1, 23), offset)),
      ),
    );
  });

  it("places timed and all-day ideas on their local due day only", () => {
    const ideas = [
      timed(0, 18, 0, "Evening"),
      ideaFixture({ title: "All day", dueDate: "2026-11-28" }),
      ideaFixture({ title: "Finished", dueDate: "2026-11-27", status: "done" }),
      ideaFixture({ title: "Someday", dueDate: "2026-11-27", status: "someday" }),
      ideaFixture({ title: "Undated" }),
    ];
    const cells = buildMonthGrid(2026, 10, ideas, now);
    const today = cells.find((cell) => cell.key === "2026-11-27");
    expect(today?.entries).toHaveLength(1);
    expect(today?.entries[0]).toMatchObject({
      timed: true,
      timeLabel: "18:00",
      startMinutes: 18 * 60,
    });
    expect(today?.entries[0].idea.title).toBe("Evening");

    const tomorrow = cells.find((cell) => cell.key === "2026-11-28");
    expect(tomorrow?.entries[0]).toMatchObject({
      timed: false,
      timeLabel: null,
    });
    expect(cells.some((cell) => cell.key === "2026-11-27" && cell.entries.length > 1)).toBe(
      false,
    );
  });

  it("sorts timed chips by time before all-day chips", () => {
    const ideas = [
      ideaFixture({ title: "All day", dueDate: "2026-11-29" }),
      timed(2, 18, 0, "Late"),
      timed(2, 9, 0, "Early"),
    ];
    const cell = buildMonthGrid(2026, 10, ideas, now).find(
      (day) => day.key === "2026-11-29",
    );
    expect(cell?.entries.map((entry) => entry.idea.title)).toEqual([
      "Early",
      "Late",
      "All day",
    ]);
  });
});

describe("calendar agenda", () => {
  it("groups timed month items into overdue, today and upcoming", () => {
    const ideas = [
      timed(-2, 9, 0, "Overdue task"),
      timed(0, 18, 0, "Today task"),
      timed(3, 10, 30, "Upcoming task"),
      ideaFixture({ title: "All day item", dueDate: "2026-11-28" }),
      ideaFixture({
        title: "Done task",
        dueAt: new Date(2026, 10, 27, 11).toISOString(),
        status: "done",
      }),
      ideaFixture({
        title: "Next month",
        dueAt: new Date(2026, 11, 2, 10).toISOString(),
      }),
      ideaFixture({ title: "Undated task" }),
    ];
    const groups = calendarAgenda(ideas, now, 2026, 10);
    expect(groups.map((group) => group.key)).toEqual([
      "overdue",
      "today",
      "upcoming",
    ]);
    expect(groups[0].ideas.map((idea) => idea.title)).toEqual(["Overdue task"]);
    expect(groups[1].ideas.map((idea) => idea.title)).toEqual(["Today task"]);
    expect(groups[2].ideas.map((idea) => idea.title)).toEqual(["Upcoming task"]);
  });

  it("returns no groups when the month has no timed items", () => {
    const allDay = [ideaFixture({ title: "All day", dueDate: "2026-11-28" })];
    expect(calendarAgenda(allDay, now, 2026, 10)).toEqual([]);
  });
});

describe("calendar drag", () => {
  it("moves an all-day idea to another date", () => {
    const idea = ideaFixture({ dueDate: "2026-11-27" });
    expect(reschedulePatch(idea, "2026-12-03")).toEqual({
      dueDate: "2026-12-03",
    });
    expect(reschedulePatch(idea, "2026-11-27")).toBeNull();
    expect(reschedulePatch(idea, "2026-02-31")).toBeNull();
    expect(reschedulePatch(ideaFixture({}), "2026-12-03")).toBeNull();
  });

  it("keeps the local time of day for a timed idea", () => {
    const idea = ideaFixture({
      dueAt: new Date(2026, 10, 27, 23, 30, 0, 0).toISOString(),
    });
    const patch = reschedulePatch(idea, "2026-12-01");
    expect(patch?.dueAt).toBeDefined();
    expect(patch?.dueDate).toBeUndefined();
    const moved = new Date(patch?.dueAt ?? "");
    expect(localDateKey(moved)).toBe("2026-12-01");
    expect(moved.getHours()).toBe(23);
    expect(moved.getMinutes()).toBe(30);
  });

  it("recomputes the offset when the move crosses DST", () => {
    const idea = ideaFixture({
      dueAt: new Date(2026, 2, 7, 23, 30, 0, 0).toISOString(),
    });
    const patch = reschedulePatch(idea, "2026-03-09");
    expect(patch?.dueAt?.endsWith("-04:00")).toBe(true);
    const moved = new Date(patch?.dueAt ?? "");
    expect(localDateKey(moved)).toBe("2026-03-09");
    expect(moved.getHours()).toBe(23);
    expect(moved.getMinutes()).toBe(30);
  });

  it("tracks the chip and the hovered day in a pure reducer", () => {
    const started = calendarDragReducer(IDLE_CALENDAR_DRAG, {
      type: "start",
      ideaId: "idea-1",
      fromKey: "2026-11-27",
    });
    expect(started).toEqual({
      ideaId: "idea-1",
      fromKey: "2026-11-27",
      overKey: "2026-11-27",
    });
    const over = calendarDragReducer(started, {
      type: "over",
      dateKey: "2026-11-30",
    });
    expect(over.overKey).toBe("2026-11-30");
    expect(calendarDragReducer(IDLE_CALENDAR_DRAG, {
      type: "over",
      dateKey: "2026-11-30",
    })).toEqual(IDLE_CALENDAR_DRAG);
    expect(calendarDragReducer(over, { type: "end" })).toEqual(
      IDLE_CALENDAR_DRAG,
    );
    expect(calendarDragReducer(over, { type: "cancel" })).toEqual(
      IDLE_CALENDAR_DRAG,
    );
  });
});

describe("calendar keyboard", () => {
  const first = "2026-02-23";
  const last = "2026-04-05";

  it("moves by day and week and clamps at the grid edges", () => {
    expect(calendarFocusKey("2026-03-04", "ArrowLeft", first, last)).toBe(
      "2026-03-03",
    );
    expect(calendarFocusKey("2026-03-04", "ArrowRight", first, last)).toBe(
      "2026-03-05",
    );
    expect(calendarFocusKey("2026-03-04", "ArrowUp", first, last)).toBe(
      "2026-02-25",
    );
    expect(calendarFocusKey("2026-03-04", "ArrowDown", first, last)).toBe(
      "2026-03-11",
    );
    expect(calendarFocusKey(first, "ArrowLeft", first, last)).toBeNull();
    expect(calendarFocusKey(last, "ArrowRight", first, last)).toBeNull();
    expect(calendarFocusKey(first, "ArrowUp", first, last)).toBeNull();
    expect(calendarFocusKey("missing", "ArrowLeft", first, last)).toBeNull();
  });

  it("jumps Home and End to Monday and Sunday of the row", () => {
    // 2026-03-04 is a Wednesday; the row runs 2026-03-02 … 2026-03-08.
    expect(calendarFocusKey("2026-03-04", "Home", first, last)).toBe(
      "2026-03-02",
    );
    expect(calendarFocusKey("2026-03-04", "End", first, last)).toBe(
      "2026-03-08",
    );
  });

  it("localizes day labels and Monday-first weekday headers", () => {
    expect(formatCalendarDate("2026-11-27", "en")).toContain("Friday");
    expect(formatCalendarDate("2026-11-27", "en")).toContain("November");
    expect(formatCalendarDate("2026-11-27", "en", "short")).toBe("Nov 27");
    expect(weekdayLabels("en", "short")).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(weekdayLabels("ru", "short")).toHaveLength(7);
    expect(weekdayLabels("zh", "short")).toHaveLength(7);
  });
});
