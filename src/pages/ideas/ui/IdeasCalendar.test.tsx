import { describe, expect, it } from "vitest";
import type { IdeaExportSource } from "@/features/ideas-export";
import { ideaFixture } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { fakeIdeas } from "../api/fakeIdeas";
import { IdeasCalendar } from "./IdeasCalendar";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

const exportSource: IdeaExportSource = {
  fetchIcs: async () => "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
};

function renderCalendar(
  ideas = fakeIdeas(now),
  locale: "en" | "ru" | "zh" = "en",
): string {
  return renderPage(
    <IdeasCalendar
      ideas={ideas}
      now={now}
      exportSource={exportSource}
      onCreateForDay={() => undefined}
      onOpenIdea={() => undefined}
      onReschedule={() => undefined}
    />,
    locale,
  );
}

describe("IdeasCalendar", () => {
  it("renders a six-week ARIA grid with the month navigation and export", () => {
    const html = renderCalendar();
    expect(html).toContain('class="ideas-calendar"');
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Ideas calendar"');
    expect(html).toContain("November 2026");
    expect(html).toContain('aria-label="Previous month"');
    expect(html).toContain('aria-label="Next month"');
    expect(html).toContain(">Today</button>");
    expect(html).toContain("Export .ics");
    expect((html.match(/role="gridcell"/g) ?? []).length).toBe(42);
    expect((html.match(/role="columnheader"/g) ?? []).length).toBe(7);
    expect((html.match(/role="row"/g) ?? []).length).toBe(7);
    expect(html).toContain("Mon");
    expect(html).toContain("Sun");
  });

  it("marks today and puts one roving tab stop in the grid", () => {
    const html = renderCalendar();
    expect(html).toContain('data-date-key="2026-11-27"');
    expect(html).toContain('aria-current="date"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(
      'aria-label="Friday, November 27. Ideas: 2. Add an idea."',
    );
  });

  it("renders timed and all-day chips and hides closed or undated ideas", () => {
    const html = renderCalendar();
    expect(html).toContain("Тёмная тема для календаря");
    expect(html).toContain("18:00");
    expect(html).toContain("Продлить страховку");
    expect(html).toContain('aria-label="Тёмная тема для календаря, 18:00"');
    expect(html).toContain('aria-label="Продлить страховку, All day"');
    expect(html).toContain("Позвонить стоматологу");
    expect(html).toContain("Закрыть issue #1");
    expect(html).not.toContain("Починить футер");
    expect(html).not.toContain("Перейти на Tailwind");
    expect(html).not.toContain("Посмотреть курс по Rust");
    expect(html).toContain('draggable="true"');
  });

  it("caps a day at three chips and exposes the rest as a labeled button", () => {
    const crowded = Array.from({ length: 4 }, (_, index) =>
      ideaFixture({
        id: `idea-2026-11-10-crowded-${index}`,
        title: `Crowded ${index + 1}`,
        dueDate: "2026-11-10",
      }),
    );
    const html = renderCalendar(crowded);
    expect(html).toContain("Crowded 1");
    expect(html).toContain("Crowded 3");
    expect(html).not.toContain('class="calendar-chip-title">Crowded 4');
    expect(html).toContain('aria-label="1 more: Crowded 4"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">+1 more</button>");
    expect(html).toContain('title="Crowded 4"');
  });

  it("lists timed items in the agenda and leaves all-day items in the grid", () => {
    const html = renderCalendar();
    expect(html).toContain("Agenda");
    expect(html).toContain("Upcoming");
    expect(html).toContain('class="calendar-agenda-title">Тёмная тема для календаря');
    expect(html).toContain('class="calendar-agenda-title">Закрыть issue #1');
    expect(html).not.toContain(
      'class="calendar-agenda-title">Продлить страховку',
    );
    // The only overdue item is all-day, so the agenda has no Overdue group.
    expect(html).not.toContain(">Overdue</h4>");
    const labelledBy = /class="calendar-agenda" aria-labelledby="([^"]+)"/.exec(
      html,
    )?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });

  it("includes timed items on visible leading grid days in the agenda", () => {
    const leading = ideaFixture({
      title: "Leading Monday",
      dueAt: new Date(2026, 9, 26, 9, 0, 0, 0).toISOString(),
    });
    const html = renderCalendar([leading]);
    expect(html).toContain('data-date-key="2026-10-26"');
    expect(html).toContain('class="calendar-agenda-title">Leading Monday');
  });

  it("translates the calendar into Russian and Chinese", () => {
    const ru = renderCalendar(fakeIdeas(now), "ru");
    expect(ru).toContain("Календарь идей");
    expect(ru).toContain("Расписание");
    expect(ru).toContain("Экспорт .ics");
    expect(ru).toContain("Сегодня");

    const zh = renderCalendar(fakeIdeas(now), "zh");
    expect(zh).toContain("想法日历");
    expect(zh).toContain("日程");
    expect(zh).toContain("导出 .ics");
    expect(zh).toContain("今天");
  });

  it("shows a dimmed honest empty agenda when the view has no timed items", () => {
    const html = renderCalendar([
      ideaFixture({ title: "All day only", dueDate: "2026-11-10" }),
    ]);
    expect(html).toContain("No timed ideas in this view.");
  });
});
