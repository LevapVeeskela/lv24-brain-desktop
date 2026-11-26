import {
  useId,
  useReducer,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { Idea, IdeaUpdateInput } from "@/entities/ideas/model/types";
import {
  ExportIcsButton,
  type IdeaExportSource,
} from "@/features/ideas-export";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { Button } from "@/shared/ui/Button";
import {
  buildMonthGrid,
  calendarAgenda,
  calendarDragReducer,
  calendarFocusKey,
  calendarMonth,
  CALENDAR_CHIP_LIMIT,
  formatCalendarDate,
  groupCalendarWeeks,
  IDLE_CALENDAR_DRAG,
  isCalendarNavigationKey,
  prioritizeCalendarEntries,
  reschedulePatch,
  shiftCalendarMonth,
  weekdayLabels,
  type CalendarAgendaKey,
  type CalendarDay,
} from "../model/calendar";
import { formatIdeaDue, localDateKey } from "../model/format";

const agendaKeys: Record<CalendarAgendaKey, MessageKey> = {
  overdue: "ideas.calendar.agenda.overdue",
  today: "ideas.calendar.agenda.today",
  upcoming: "ideas.calendar.agenda.upcoming",
};

export interface IdeasCalendarProps {
  /** Already filtered by the page scope and search. */
  ideas: readonly Idea[];
  now: Date;
  exportSource: IdeaExportSource;
  onCreateForDay: (dateKey: string) => void;
  onOpenIdea: (ideaId: string) => void;
  onReschedule: (ideaId: string, patch: IdeaUpdateInput) => void;
}

/**
 * Zero-dependency month view: Monday-first six-week grid, chips on due days,
 * drag-to-reschedule, timed agenda and an injectable `.ics` export.
 */
export function IdeasCalendar({
  ideas,
  now,
  exportSource,
  onCreateForDay,
  onOpenIdea,
  onReschedule,
}: IdeasCalendarProps) {
  const { t, locale } = useI18n();
  const [month, setMonth] = useState(() => calendarMonth(now));
  const [focusKey, setFocusKey] = useState(() => localDateKey(now));
  const [drag, dispatch] = useReducer(calendarDragReducer, IDLE_CALENDAR_DRAG);
  const [expandedDays, setExpandedDays] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [recentMove, setRecentMove] = useState<{
    ideaId: string;
    dayKey: string;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const agendaTitleId = useId();

  const days = buildMonthGrid(month.year, month.month, ideas, now);
  const weeks = groupCalendarWeeks(days);
  const agenda = calendarAgenda(ideas, now, month.year, month.month);
  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(
    locale,
    { month: "long", year: "numeric" },
  );
  const gridFirstKey = days[0]?.key ?? "";
  const gridLastKey = days[days.length - 1]?.key ?? "";
  const weekdays = weekdayLabels(locale, "short");
  const weekdaysLong = weekdayLabels(locale, "long");

  const focusCell = (key: string): void => {
    if (typeof requestAnimationFrame !== "function") {
      return;
    }
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-date-key="${key}"]`)
        ?.focus();
    });
  };

  const goToMonth = (delta: number): void => {
    const next = shiftCalendarMonth(month, delta);
    setMonth(next);
    setFocusKey(localDateKey(new Date(next.year, next.month, 1)));
  };

  const goToToday = (): void => {
    setMonth(calendarMonth(now));
    const key = localDateKey(now);
    setFocusKey(key);
    focusCell(key);
  };

  const setDayExpanded = (key: string, expanded: boolean): void => {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleDayKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    day: CalendarDay,
  ): void => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCreateForDay(day.key);
      return;
    }
    if (!isCalendarNavigationKey(event.key)) {
      return;
    }
    event.preventDefault();
    const next = calendarFocusKey(
      day.key,
      event.key,
      gridFirstKey,
      gridLastKey,
    );
    if (!next) {
      return;
    }
    setFocusKey(next);
    focusCell(next);
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
    day: CalendarDay,
  ): void => {
    event.preventDefault();
    const ideaId = drag.ideaId;
    dispatch({ type: "end" });
    if (!ideaId) {
      return;
    }
    const idea = ideas.find((item) => item.id === ideaId);
    if (!idea) {
      return;
    }
    const patch = reschedulePatch(idea, day.key);
    if (patch) {
      setRecentMove({ ideaId: idea.id, dayKey: day.key });
      onReschedule(idea.id, patch);
    }
  };

  return (
    <section className="ideas-calendar" aria-label={t("ideas.calendar.label")}>
      <header className="calendar-header">
        <div className="calendar-nav">
          <Button
            variant="ghost"
            aria-label={t("ideas.calendar.previous")}
            onClick={() => goToMonth(-1)}
          >
            ‹
          </Button>
          <h3 className="calendar-month" aria-live="polite">
            {monthLabel}
          </h3>
          <Button
            variant="ghost"
            aria-label={t("ideas.calendar.next")}
            onClick={() => goToMonth(1)}
          >
            ›
          </Button>
          <Button variant="secondary" onClick={goToToday}>
            {t("ideas.calendar.today")}
          </Button>
        </div>
        <ExportIcsButton source={exportSource} now={() => now} />
      </header>

      <div
        ref={gridRef}
        className="calendar-grid"
        role="grid"
        aria-label={t("ideas.calendar.label")}
        onDragLeave={(event) => {
          // Only leaving the whole grid clears the highlight; per-cell leave
          // arrives after the next cell's dragover and would wipe it.
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            dispatch({ type: "over", dateKey: null });
          }
        }}
      >
        <div role="row" className="calendar-weekdays">
          {weekdays.map((label, index) => (
            <div
              key={weekdaysLong[index] ?? label}
              role="columnheader"
              aria-label={weekdaysLong[index]}
              className="calendar-weekday"
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div
            role="row"
            className="calendar-week"
            key={week[0]?.key ?? "week"}
          >
            {week.map((day) => {
              // The just-moved chip goes first so a crowded target day shows
              // the result without expanding; the `+N` count stays truthful.
              const ordered =
                recentMove?.dayKey === day.key
                  ? prioritizeCalendarEntries(day.entries, recentMove.ideaId)
                  : day.entries;
              const expanded = expandedDays.has(day.key);
              const visible = expanded
                ? ordered
                : ordered.slice(0, CALENDAR_CHIP_LIMIT);
              const hidden = expanded
                ? []
                : ordered.slice(CALENDAR_CHIP_LIMIT);
              const hiddenTitles = hidden
                .map((entry) => entry.idea.title)
                .join(", ");
              const classes = ["calendar-day"];
              if (!day.inMonth) classes.push("is-outside");
              if (day.isToday) classes.push("is-today");
              if (drag.ideaId && drag.overKey === day.key) {
                classes.push("is-drop");
              }
              return (
                <div
                  key={day.key}
                  role="gridcell"
                  className={classes.join(" ")}
                  tabIndex={day.key === focusKey ? 0 : -1}
                  data-date-key={day.key}
                  aria-label={t("ideas.calendar.dayLabel", {
                    date: formatCalendarDate(day.key, locale),
                    count: day.entries.length,
                  })}
                  aria-current={day.isToday ? "date" : undefined}
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a")) {
                      return;
                    }
                    onCreateForDay(day.key);
                  }}
                  onKeyDown={(event) => handleDayKeyDown(event, day)}
                  onDragOver={(event) => {
                    // dragover, not dragenter: it repeats on the actually
                    // hovered cell and cannot be cleared by the previous one.
                    if (!drag.ideaId) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    if (drag.overKey !== day.key) {
                      dispatch({ type: "over", dateKey: day.key });
                    }
                  }}
                  onDrop={(event) => handleDrop(event, day)}
                >
                  <span className="calendar-day-number" aria-hidden="true">
                    {day.date.getDate()}
                  </span>
                  <div className="calendar-chips">
                    {visible.map((entry) => (
                      <button
                        key={entry.idea.id}
                        type="button"
                        className={[
                          "calendar-chip",
                          entry.timed ? "is-timed" : "is-all-day",
                          drag.ideaId === entry.idea.id ? "is-dragging" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        draggable
                        title={formatIdeaDue(entry.idea, locale) ?? entry.idea.title}
                        aria-label={
                          entry.timed && entry.timeLabel
                            ? `${entry.idea.title}, ${entry.timeLabel}`
                            : `${entry.idea.title}, ${t("ideas.dueAllDay")}`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenIdea(entry.idea.id);
                        }}
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            entry.idea.id,
                          );
                          dispatch({
                            type: "start",
                            ideaId: entry.idea.id,
                            fromKey: day.key,
                          });
                        }}
                        onDragEnd={() => dispatch({ type: "end" })}
                      >
                        {entry.timeLabel ? (
                          <span className="calendar-chip-time">
                            {entry.timeLabel}
                          </span>
                        ) : null}
                        <span className="calendar-chip-title">
                          {entry.idea.title}
                        </span>
                      </button>
                    ))}
                    {hidden.length > 0 ||
                    (expanded && ordered.length > CALENDAR_CHIP_LIMIT) ? (
                      <button
                        type="button"
                        className="calendar-more"
                        aria-expanded={expanded}
                        aria-label={
                          expanded
                            ? t("ideas.calendar.less")
                            : t("ideas.calendar.moreLabel", {
                                count: hidden.length,
                                titles: hiddenTitles,
                              })
                        }
                        title={expanded ? undefined : hiddenTitles}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDayExpanded(day.key, !expanded);
                        }}
                      >
                        {expanded
                          ? t("ideas.calendar.less")
                          : t("ideas.calendar.more", {
                              count: hidden.length,
                            })}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="muted small calendar-hint">
        {t("ideas.calendar.hint")}
      </p>

      <section
        className="calendar-agenda"
        aria-labelledby={agendaTitleId}
      >
        <h3 id={agendaTitleId}>{t("ideas.calendar.agenda")}</h3>
        {agenda.length === 0 ? (
          <p className="muted small">{t("ideas.calendar.agenda.empty")}</p>
        ) : (
          agenda.map((group) => (
            <div className="calendar-agenda-group" key={group.key}>
              <h4>{t(agendaKeys[group.key])}</h4>
              <ul className="calendar-agenda-list">
                {group.ideas.map((idea) => (
                  <li key={idea.id}>
                    <button
                      type="button"
                      className="calendar-agenda-item"
                      onClick={() => onOpenIdea(idea.id)}
                    >
                      <span className="calendar-agenda-time">
                        {formatIdeaDue(idea, locale)}
                      </span>
                      <span className="calendar-agenda-title">
                        {idea.title}
                      </span>
                      <span className="idea-chip idea-project">
                        {idea.projectId}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </section>
  );
}
