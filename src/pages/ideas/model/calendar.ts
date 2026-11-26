import {
  isOpenIdeaStatus,
  type Idea,
  type IdeaUpdateInput,
} from "@/entities/ideas/model/types";
import {
  dayDifference,
  ideaDueDay,
  localDateKey,
  localDateTimeToIso,
  parseLocalDateKey,
} from "./format";

/** A month grid always renders six Monday-first weeks for a stable layout. */
export const CALENDAR_WEEKS = 6;
export const CALENDAR_DAYS = CALENDAR_WEEKS * 7;
export const CALENDAR_CHIP_LIMIT = 3;

export interface CalendarMonth {
  year: number;
  /** Zero-based, like `Date#getMonth`. */
  month: number;
}

export interface CalendarEntry {
  idea: Idea;
  /** `due_at` (true) versus `due_date` (false). */
  timed: boolean;
  /** `HH:MM` in the machine's local time for timed ideas; null for all-day. */
  timeLabel: string | null;
  /** Minutes since local midnight; all-day entries sort after timed ones. */
  startMinutes: number;
}

export interface CalendarDay {
  date: Date;
  /** `YYYY-MM-DD`, the same key shape as `due_date`. */
  key: string;
  inMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
}

export type CalendarAgendaKey = "overdue" | "today" | "upcoming";

export interface CalendarAgendaGroup {
  key: CalendarAgendaKey;
  ideas: Idea[];
}

export type CalendarNavigationKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End";

const navigationKeys: readonly CalendarNavigationKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
];

export function isCalendarNavigationKey(
  key: string,
): key is CalendarNavigationKey {
  return (navigationKeys as readonly string[]).includes(key);
}

/**
 * Local midnight of a calendar day. The `Date` constructor normalizes month
 * and day overflow, so this is also the basis for day arithmetic.
 */
export function localDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

/**
 * Adds whole local days. Never adds 86_400_000 ms: a DST transition day is 23
 * or 25 hours long, while the local calendar date must still advance by one.
 */
export function addLocalDays(value: Date, days: number): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days);
}

/** Monday = 0 … Sunday = 6. */
export function mondayIndex(value: Date): number {
  return (value.getDay() + 6) % 7;
}

/** The 42 local days of a six-week Monday-first month grid. */
export function monthGridDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = addLocalDays(first, -mondayIndex(first));
  return Array.from({ length: CALENDAR_DAYS }, (_, index) =>
    addLocalDays(start, index),
  );
}

export function calendarMonth(value: Date): CalendarMonth {
  return { year: value.getFullYear(), month: value.getMonth() };
}

export function shiftCalendarMonth(
  current: CalendarMonth,
  delta: number,
): CalendarMonth {
  return calendarMonth(new Date(current.year, current.month + delta, 1));
}

/** First and last calendar day of the month, as local date keys. */
export function monthBounds(
  year: number,
  month: number,
): { firstKey: string; lastKey: string } {
  return {
    firstKey: localDateKey(new Date(year, month, 1)),
    lastKey: localDateKey(new Date(year, month + 1, 0)),
  };
}

function timeOfDay(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;
}

function calendarEntry(idea: Idea): CalendarEntry | null {
  if (!isOpenIdeaStatus(idea.status)) {
    return null;
  }
  if (!ideaDueDay(idea)) {
    return null;
  }
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (Number.isNaN(due.getTime())) {
      return null;
    }
    return {
      idea,
      timed: true,
      timeLabel: timeOfDay(due),
      startMinutes: due.getHours() * 60 + due.getMinutes(),
    };
  }
  return {
    idea,
    timed: false,
    timeLabel: null,
    startMinutes: 24 * 60,
  };
}

function compareEntries(left: CalendarEntry, right: CalendarEntry): number {
  if (left.timed !== right.timed) {
    return left.timed ? -1 : 1;
  }
  if (left.startMinutes !== right.startMinutes) {
    return left.startMinutes - right.startMinutes;
  }
  return left.idea.title.localeCompare(right.idea.title);
}

/** Buckets due ideas by local date key for the supplied grid days. */
export function placeIdeasOnDays(
  ideas: readonly Idea[],
  days: readonly Date[],
): Map<string, CalendarEntry[]> {
  const known = new Set(days.map((day) => localDateKey(day)));
  const byKey = new Map<string, CalendarEntry[]>();
  for (const idea of ideas) {
    const entry = calendarEntry(idea);
    const dueDay = entry ? ideaDueDay(idea) : null;
    if (!entry || !dueDay) {
      continue;
    }
    const key = localDateKey(dueDay);
    if (!known.has(key)) {
      continue;
    }
    const list = byKey.get(key);
    if (list) {
      list.push(entry);
    } else {
      byKey.set(key, [entry]);
    }
  }
  for (const list of byKey.values()) {
    list.sort(compareEntries);
  }
  return byKey;
}

/** The 42 cells of the month grid, each with its due ideas. */
export function buildMonthGrid(
  year: number,
  month: number,
  ideas: readonly Idea[],
  now: Date,
): CalendarDay[] {
  const days = monthGridDays(year, month);
  const byKey = placeIdeasOnDays(ideas, days);
  const first = new Date(year, month, 1);
  const targetYear = first.getFullYear();
  const targetMonth = first.getMonth();
  const todayKey = localDateKey(now);
  return days.map((date) => {
    const key = localDateKey(date);
    return {
      date,
      key,
      inMonth: date.getFullYear() === targetYear && date.getMonth() === targetMonth,
      isToday: key === todayKey,
      entries: byKey.get(key) ?? [],
    };
  });
}

export function groupCalendarWeeks(
  days: readonly CalendarDay[],
): CalendarDay[][] {
  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function sortAgenda(ideas: Idea[]): Idea[] {
  return ideas.slice().sort((left, right) => {
    const leftTime = left.dueAt ? Date.parse(left.dueAt) : 0;
    const rightTime = right.dueAt ? Date.parse(right.dueAt) : 0;
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.title.localeCompare(right.title);
  });
}

/**
 * Timed, open ideas of the visible month, grouped relative to today. All-day
 * ideas live in the grid only; the agenda is the "next at 18:00" list.
 */
export function calendarAgenda(
  ideas: readonly Idea[],
  now: Date,
  year: number,
  month: number,
): CalendarAgendaGroup[] {
  const bounds = monthBounds(year, month);
  const buckets: Record<CalendarAgendaKey, Idea[]> = {
    overdue: [],
    today: [],
    upcoming: [],
  };
  for (const idea of ideas) {
    if (!isOpenIdeaStatus(idea.status) || !idea.dueAt) {
      continue;
    }
    const due = new Date(idea.dueAt);
    if (Number.isNaN(due.getTime())) {
      continue;
    }
    const key = localDateKey(due);
    if (key < bounds.firstKey || key > bounds.lastKey) {
      continue;
    }
    const diff = dayDifference(due, now);
    if (diff < 0) {
      buckets.overdue.push(idea);
    } else if (diff === 0) {
      buckets.today.push(idea);
    } else {
      buckets.upcoming.push(idea);
    }
  }
  return (["overdue", "today", "upcoming"] as const)
    .map((key) => ({ key, ideas: sortAgenda(buckets[key]) }))
    .filter((group) => group.ideas.length > 0);
}

/**
 * Patch that moves an idea to `dateKey` and keeps its local time of day.
 * All-day ideas stay all-day; timed ideas keep hours and minutes and get the
 * offset that is correct for the target date (including DST changes).
 * Undated ideas and no-op moves return null.
 */
export function reschedulePatch(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  dateKey: string,
): IdeaUpdateInput | null {
  const target = parseLocalDateKey(dateKey);
  if (!target) {
    return null;
  }
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (Number.isNaN(due.getTime())) {
      return null;
    }
    if (localDateKey(due) === dateKey) {
      return null;
    }
    const dueAt = localDateTimeToIso(dateKey, timeOfDay(due));
    return dueAt ? { dueAt } : null;
  }
  if (idea.dueDate) {
    return idea.dueDate === dateKey ? null : { dueDate: dateKey };
  }
  return null;
}

export interface CalendarDragState {
  ideaId: string | null;
  fromKey: string | null;
  overKey: string | null;
}

export type CalendarDragAction =
  | { type: "start"; ideaId: string; fromKey: string }
  | { type: "over"; dateKey: string | null }
  | { type: "end" }
  | { type: "cancel" };

export const IDLE_CALENDAR_DRAG: CalendarDragState = Object.freeze({
  ideaId: null,
  fromKey: null,
  overKey: null,
});

/** Pure drag state for the chip-to-day interaction. */
export function calendarDragReducer(
  state: CalendarDragState,
  action: CalendarDragAction,
): CalendarDragState {
  switch (action.type) {
    case "start":
      return {
        ideaId: action.ideaId,
        fromKey: action.fromKey,
        overKey: action.fromKey,
      };
    case "over":
      return state.ideaId ? { ...state, overKey: action.dateKey } : state;
    case "end":
    case "cancel":
      return IDLE_CALENDAR_DRAG;
  }
}

/**
 * Roving focus for the grid: arrows move by one day/week, Home/End jump to
 * Monday/Sunday of the current row. Returns null at a grid edge so the caller
 * leaves focus alone.
 */
export function calendarFocusKey(
  currentKey: string,
  key: CalendarNavigationKey,
  firstKey: string,
  lastKey: string,
): string | null {
  const current = parseLocalDateKey(currentKey);
  const first = parseLocalDateKey(firstKey);
  const last = parseLocalDateKey(lastKey);
  if (!current || !first || !last) {
    return null;
  }
  const index = dayDifference(current, first);
  const total = dayDifference(last, first) + 1;
  if (index < 0 || index >= total) {
    return null;
  }
  let next = index;
  switch (key) {
    case "ArrowLeft":
      next = index - 1;
      break;
    case "ArrowRight":
      next = index + 1;
      break;
    case "ArrowUp":
      next = index - 7;
      break;
    case "ArrowDown":
      next = index + 7;
      break;
    case "Home":
      next = index - (index % 7);
      break;
    case "End":
      next = index - (index % 7) + 6;
      break;
  }
  if (next < 0 || next >= total) {
    return null;
  }
  return localDateKey(addLocalDays(first, next));
}

export type CalendarDateFormat = "long" | "short";

/** Localized day label for cell accessibility and the quick-add chip. */
export function formatCalendarDate(
  key: string,
  locale: string,
  style: CalendarDateFormat = "long",
): string {
  const date = parseLocalDateKey(key);
  if (!date) {
    return key;
  }
  return date.toLocaleDateString(
    locale,
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric" }
      : { month: "short", day: "numeric" },
  );
}

/** Monday-first weekday headers; `Intl` localizes both widths. */
export function weekdayLabels(
  locale: string,
  style: "long" | "short",
): string[] {
  // 2024-01-01 was a Monday; noon keeps the sample away from DST edges.
  const monday = new Date(2024, 0, 1, 12);
  return Array.from({ length: 7 }, (_, index) =>
    addLocalDays(monday, index).toLocaleDateString(locale, {
      weekday: style,
    }),
  );
}
