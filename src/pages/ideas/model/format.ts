import type { Idea } from "@/entities/ideas/model/types";

/** Whole local days since the epoch; immune to DST hour shifts. */
function dayNumber(value: Date): number {
  return (
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000
  );
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** `YYYY-MM-DD` in the machine's local calendar, never UTC-shifted. */
export function localDateKey(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` as local midnight, not as a UTC instant. */
export function parseLocalDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return null;
  }
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(date.getTime()) || localDateKey(date) !== key.trim()) {
    return null;
  }
  return date;
}

/** Positive when `value` is on a later local day than `base`. */
export function dayDifference(value: Date, base: Date): number {
  return dayNumber(value) - dayNumber(base);
}

/** Sunday of the current Monday-first week, at local midnight. */
export function endOfLocalWeek(value: Date): Date {
  const daysUntilSunday = (7 - value.getDay()) % 7;
  const end = startOfLocalDay(value);
  end.setDate(end.getDate() + daysUntilSunday);
  return end;
}

export function isTimedIdea(idea: Pick<Idea, "dueAt" | "dueDate">): boolean {
  return Boolean(idea.dueAt);
}

/** The local day an idea is due on; timed ideas use the local date of dueAt. */
export function ideaDueDay(idea: Pick<Idea, "dueAt" | "dueDate">): Date | null {
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    return Number.isNaN(due.getTime()) ? null : startOfLocalDay(due);
  }
  if (idea.dueDate) {
    return parseLocalDateKey(idea.dueDate);
  }
  return null;
}

export function isIdeaOverdue(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  now: Date,
): boolean {
  const dueDay = ideaDueDay(idea);
  return dueDay ? dayDifference(dueDay, now) < 0 : false;
}

export function isIdeaDueToday(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  now: Date,
): boolean {
  const dueDay = ideaDueDay(idea);
  return dueDay ? dayDifference(dueDay, now) === 0 : false;
}

export function daysOverdue(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  now: Date,
): number {
  const dueDay = ideaDueDay(idea);
  return dueDay ? Math.max(0, -dayDifference(dueDay, now)) : 0;
}

export type DueChip =
  | { kind: "overdue"; days: number }
  | { kind: "time"; time: string }
  | { kind: "allDay" }
  | { kind: "weekday"; label: string }
  | { kind: "date"; label: string };

function timeOfDay(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * Dense due chip content. The caller translates `overdue`/`allDay`; weekday and
 * date labels already come from `Intl` for the current locale.
 */
export function dueChip(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  now: Date,
  locale: string,
): DueChip | null {
  const dueDay = ideaDueDay(idea);
  if (!dueDay) {
    return null;
  }
  const diff = dayDifference(dueDay, now);
  if (diff < 0) {
    return { kind: "overdue", days: -diff };
  }
  if (diff === 0) {
    if (idea.dueAt) {
      const due = new Date(idea.dueAt);
      return Number.isNaN(due.getTime())
        ? { kind: "allDay" }
        : { kind: "time", time: timeOfDay(due) };
    }
    return { kind: "allDay" };
  }
  if (dayNumber(dueDay) <= dayNumber(endOfLocalWeek(now))) {
    return {
      kind: "weekday",
      label: dueDay.toLocaleDateString(locale, { weekday: "short" }),
    };
  }
  const dateLabel = dueDay.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (!Number.isNaN(due.getTime())) {
      return { kind: "date", label: `${dateLabel}, ${timeOfDay(due)}` };
    }
  }
  return { kind: "date", label: dateLabel };
}

/** Full timestamp for the drawer and row tooltips. */
export function formatIdeaDue(
  idea: Pick<Idea, "dueAt" | "dueDate">,
  locale: string,
): string | null {
  const dueDay = ideaDueDay(idea);
  if (!dueDay) {
    return null;
  }
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (!Number.isNaN(due.getTime())) {
      return due.toLocaleString(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    }
  }
  return dueDay.toLocaleDateString(locale, { dateStyle: "medium" });
}

export type LeadUnit = "minute" | "hour" | "day";
export interface LeadParts {
  count: number;
  unit: LeadUnit;
}

/** `2h`/`1d` style reminder lead, broken into a translatable unit. */
export function formatLeadParts(minutes: number): LeadParts | null {
  const value = Math.trunc(minutes);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 60) {
    return { count: value, unit: "minute" };
  }
  if (value < 1440) {
    return value % 60 === 0
      ? { count: value / 60, unit: "hour" }
      : { count: value, unit: "minute" };
  }
  if (value % 1440 === 0) {
    return { count: value / 1440, unit: "day" };
  }
  return value % 60 === 0
    ? { count: value / 60, unit: "hour" }
    : { count: value, unit: "minute" };
}

/** Builds an RFC3339 timestamp with the machine's current offset. */
export function localDateTimeToIso(dateKey: string, time: string): string | null {
  const day = parseLocalDateKey(dateKey);
  const match = /^(\d{2}):(\d{2})$/.exec(time.trim());
  if (!day || !match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  const value = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(
    absolute % 60,
  ).padStart(2, "0")}`;
  return `${localDateKey(value)}T${timeOfDay(value)}:00${offset}`;
}

/** Splits an idea due value into the drawer's date/time inputs. */
export function dueInputs(
  idea: Pick<Idea, "dueAt" | "dueDate">,
): { date: string; time: string } {
  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (!Number.isNaN(due.getTime())) {
      return { date: localDateKey(due), time: timeOfDay(due) };
    }
  }
  return { date: idea.dueDate ?? "", time: "" };
}

/** Raw source line for the drawer; resolvable links are a WS7 concern. */
export function ideaSourceText(idea: Pick<Idea, "source">): string | null {
  if (!idea.source) {
    return null;
  }
  return [idea.source.type, idea.source.harness, idea.source.id]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" · ");
}
