import { describe, expect, it } from "vitest";
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
  monthGridDays,
  prioritizeCalendarEntries,
  reschedulePatch,
  shiftCalendarMonth,
  weekdayLabels,
} from "./calendar";
import { localDateKey } from "./format";

// Friday, 2026-11-27, noon local time.
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

function timedOn(dateKey: string, hour: number, title: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return ideaFixture({
    title,
    dueAt: new Date(year, month - 1, day, hour, 0, 0, 0).toISOString(),
  });
}

/** `+03:00` / `-04:00` for a local date, independent of the machine zone. */
function offsetText(value: Date): string {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(
    absolute % 60,
  ).padStart(2, "0")}`;
}

/** A local day is 23 or 25 hours long only in zones with a DST transition. */
function findDstShift(
  year: number,
): { hours: number; day: Date; nextKey: string } | null {
  for (let month = 0; month < 12; month += 1) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day < lastDay; day += 1) {
      const start = new Date(year, month, day);
      const next = new Date(year, month, day + 1);
      const hours = (next.getTime() - start.getTime()) / 3_600_000;
      if (hours !== 24) {
        return { hours, day: start, nextKey: localDateKey(next) };
      }
    }
  }
  return null;
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

  it("keeps local day math DST-safe for every day of a year", () => {
    // The build machine may not observe DST, so pin the invariant everywhere:
    // every local calendar day advances by exactly one date key, never by ms.
    const start = localDay(2026, 0, 1);
    for (let offset = 0; offset < 365; offset += 1) {
      const value = addLocalDays(start, offset);
      const expected = new Date(Date.UTC(2026, 0, 1 + offset))
        .toISOString()
        .slice(0, 10);
      expect(localDateKey(value)).toBe(expected);
    }
    const keys = monthGridDays(2026, 2).map(localDateKey);
    expect(keys[0]).toBe("2026-02-23");
    expect(keys[41]).toBe("2026-04-05");
    expect(new Set(keys).size).toBe(42);

    // If this machine's zone has a transition, the transition day proves the
    // arithmetic does not assume 24 hours.
    const shift = findDstShift(2026);
    if (shift) {
      expect([23, 25]).toContain(shift.hours);
      expect(localDateKey(addLocalDays(shift.day, 1))).toBe(shift.nextKey);
    }
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

  it("keeps dated someday ideas in the icebox, off the calendar", () => {
    // Product rule: Focus shows `someday` in Later, but a date on it is not a
    // schedule; the calendar and ICS must not surface it.
    const icebox = ideaFixture({
      title: "Icebox",
      status: "someday",
      dueDate: "2026-11-27",
    });
    const cell = buildMonthGrid(2026, 10, [icebox], now).find(
      (day) => day.key === "2026-11-27",
    );
    expect(cell?.entries).toEqual([]);
    expect(calendarAgenda([icebox], now, 2026, 10)).toEqual([]);
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

  it("prioritizes the just-moved idea in a crowded day", () => {
    const ideas = Array.from({ length: 4 }, (_, index) =>
      ideaFixture({
        id: `idea-moved-${index}`,
        title: `Moved ${index + 1}`,
        dueDate: "2026-11-29",
      }),
    );
    const entries =
      buildMonthGrid(2026, 10, ideas, now).find(
        (day) => day.key === "2026-11-29",
      )?.entries ?? [];
    const movedId = entries.at(-1)?.idea.id ?? "";
    const prioritized = prioritizeCalendarEntries(entries, movedId);
    expect(prioritized[0].idea.id).toBe(movedId);
    expect(prioritized).toHaveLength(4);
    expect(entries[0].idea.id).not.toBe(movedId);
    expect(prioritizeCalendarEntries(entries, "missing")).not.toBe(entries);
    expect(prioritizeCalendarEntries(entries, movedId)).not.toBe(entries);
  });
});

describe("calendar agenda", () => {
  it("groups timed grid items into overdue, today and upcoming", () => {
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
        title: "Outside the grid",
        dueAt: new Date(2026, 11, 9, 10).toISOString(),
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

  it("includes the visible leading and trailing grid days only", () => {
    const ideas = [
      timedOn("2026-10-26", 9, "Leading Monday"),
      timedOn("2026-12-06", 18, "Trailing Sunday"),
      timedOn("2026-12-07", 9, "Next month"),
    ];
    const groups = calendarAgenda(ideas, now, 2026, 10);
    const titles = groups.flatMap((group) =>
      group.ideas.map((idea) => idea.title),
    );
    expect(titles).toContain("Leading Monday");
    expect(titles).toContain("Trailing Sunday");
    expect(titles).not.toContain("Next month");
  });

  it("returns no groups when the grid has no timed items", () => {
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

  it("recomputes the offset when the move crosses a DST transition", () => {
    // Pick the machine zone's transition day when it has one; otherwise use a
    // normal March move. The local wall-clock time must survive either way.
    const shift = findDstShift(2026);
    const source = shift ? addLocalDays(shift.day, -1) : new Date(2026, 2, 7);
    const target = shift ? shift.day : new Date(2026, 2, 9);
    const idea = ideaFixture({
      dueAt: new Date(
        source.getFullYear(),
        source.getMonth(),
        source.getDate(),
        23,
        30,
        0,
        0,
      ).toISOString(),
    });
    const targetKey = localDateKey(target);
    const patch = reschedulePatch(idea, targetKey);
    const expected = new Date(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
      23,
      30,
      0,
      0,
    );
    expect(patch?.dueAt?.endsWith(offsetText(expected))).toBe(true);
    const moved = new Date(patch?.dueAt ?? "");
    expect(localDateKey(moved)).toBe(targetKey);
    expect(moved.getHours()).toBe(23);
    expect(moved.getMinutes()).toBe(30);
    if (shift) {
      expect(new Date(idea.dueAt ?? "").getTimezoneOffset()).not.toBe(
        expected.getTimezoneOffset(),
      );
    }
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
    // A later hover always wins; no stale leave can reset it in the reducer.
    const overAgain = calendarDragReducer(over, {
      type: "over",
      dateKey: "2026-12-01",
    });
    expect(overAgain.overKey).toBe("2026-12-01");
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
