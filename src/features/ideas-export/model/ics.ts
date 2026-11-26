import { isOpenIdeaStatus, type Idea } from "@/entities/ideas/model/types";

const encoder = new TextEncoder();
const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** RFC 5545 UTC stamp, `20261127T090000Z`. */
function utcStamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateKeyOf(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function nextDateKey(key: string): string | null {
  const date = parseDateKey(key);
  if (!date) {
    return null;
  }
  return dateKeyOf(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
  );
}

/** `2026-11-27` -> `20261127`, the RFC 5545 DATE value. */
function icsDate(key: string): string {
  return key.replace(/-/g, "");
}

/** Escapes `\`, `;`, `,` and newlines as RFC 5545 requires. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds content lines at 75 octets, never splitting a UTF-8 code point. The
 * leading space of a continuation line counts toward the limit.
 */
export function foldIcsLine(line: string): string[] {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) {
    return [line];
  }
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > MAX_LINE_OCTETS) {
      parts.push(current);
      current = ` ${char}`;
      bytes = 1 + size;
    } else {
      current += char;
      bytes += size;
    }
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

/** `trigger` is the complete property, with parameters when needed. */
function alarmLines(trigger: string, title: string): string[] {
  return [
    "BEGIN:VALARM",
    trigger,
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(title)}`,
    "END:VALARM",
  ];
}

/**
 * All-day reminders anchor at 09:00 local, so a relative alarm would be wrong.
 * The export writes the absolute UTC instant instead.
 */
function allDayAlarmTrigger(dayKey: string, leadMinutes: number): string | null {
  const day = parseDateKey(dayKey);
  if (!day) {
    return null;
  }
  const anchor = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    9,
    0,
    0,
    0,
  );
  anchor.setMinutes(anchor.getMinutes() - leadMinutes);
  return utcStamp(anchor);
}

function buildEvent(idea: Idea, stamp: string): string[] {
  const lead =
    idea.remindBeforeMinutes && idea.remindBeforeMinutes > 0
      ? Math.trunc(idea.remindBeforeMinutes)
      : 0;
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(idea.id)}@lv24-brain`,
    `DTSTAMP:${stamp}`,
  ];

  if (idea.dueAt) {
    const due = new Date(idea.dueAt);
    if (Number.isNaN(due.getTime())) {
      return [];
    }
    lines.push(`DTSTART:${utcStamp(due)}`);
  } else if (idea.dueDate) {
    if (!parseDateKey(idea.dueDate)) {
      return [];
    }
    lines.push(`DTSTART;VALUE=DATE:${icsDate(idea.dueDate)}`);
    const end = nextDateKey(idea.dueDate);
    if (end) {
      lines.push(`DTEND;VALUE=DATE:${icsDate(end)}`);
    }
  } else {
    return [];
  }

  lines.push(`SUMMARY:${escapeIcsText(idea.title)}`);
  if (idea.body.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(idea.body.trim())}`);
  }
  lines.push(
    `CATEGORIES:${[idea.projectId, ...idea.tags]
      .map(escapeIcsText)
      .join(",")}`,
  );

  if (lead > 0) {
    if (idea.dueAt) {
      lines.push(...alarmLines(`TRIGGER:-PT${lead}M`, idea.title));
    } else if (idea.dueDate) {
      const trigger = allDayAlarmTrigger(idea.dueDate, lead);
      if (trigger) {
        lines.push(
          ...alarmLines(`TRIGGER;VALUE=DATE-TIME:${trigger}`, idea.title),
        );
      }
    }
  }

  lines.push("END:VEVENT");
  return lines;
}

function dueValue(idea: Idea): number {
  if (idea.dueAt) {
    const value = Date.parse(idea.dueAt);
    return Number.isNaN(value) ? Number.MAX_SAFE_INTEGER : value;
  }
  if (idea.dueDate) {
    const date = parseDateKey(idea.dueDate);
    return date ? date.getTime() : Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
}

function exportable(idea: Idea): boolean {
  return isOpenIdeaStatus(idea.status) && Boolean(idea.dueAt || idea.dueDate);
}

/**
 * VEVENTs for open, dated ideas with `VALARM` from the concrete lead. All-day
 * ideas use DATE values and timed ideas use DATE-TIME (UTC); the file is
 * CRLF-terminated and folded per RFC 5545.
 */
export function buildIdeasIcs(ideas: readonly Idea[], now: Date): string {
  const stamp = utcStamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LV24 Brain//Ideas//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Ideas",
  ];
  const sorted = ideas
    .filter(exportable)
    .slice()
    .sort(
      (left, right) =>
        dueValue(left) - dueValue(right) ||
        left.title.localeCompare(right.title),
    );
  for (const idea of sorted) {
    lines.push(...buildEvent(idea, stamp));
  }
  lines.push("END:VCALENDAR");
  return lines.flatMap(foldIcsLine).join(CRLF) + CRLF;
}

/** Stable download name, `ideas-2026-11-27.ics`. */
export function icsFileName(now: Date): string {
  return `ideas-${dateKeyOf(now)}.ics`;
}
