import { observer } from "mobx-react-lite";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Project } from "@/entities/project/model/types";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import {
  createFakeIdeaExportSource,
  type IdeaExportSource,
} from "@/features/ideas-export";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import { formatCalendarDate } from "../model/calendar";
import type { IdeaScope, IdeasStore, IdeasView } from "../model/IdeasStore";
import { isTypingTarget, resolveIdeasShortcut } from "../model/keyboard";
import { IdeaDrawer, type IdeaProjectOption } from "./IdeaDrawer";
import { IdeaRow } from "./IdeaRow";
import { IdeasCalendar } from "./IdeasCalendar";

const IDEAS_VIEWS: readonly IdeasView[] = ["focus", "all", "calendar"];

const groupKeys: Record<string, MessageKey> = {
  overdue: "ideas.group.overdue",
  today: "ideas.group.today",
  week: "ideas.group.week",
  later: "ideas.group.later",
  done: "ideas.group.done",
};

function projectOptions(projects: readonly Project[]): IdeaProjectOption[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name || project.id,
  }));
}

export const IdeasPage = observer(function IdeasPage({
  ideas,
  projects,
  exportSource,
}: {
  ideas: IdeasStore;
  projects: ProjectsStore;
  /** Optional injection; WS7 supplies the real `/v1/ideas/ical` source. */
  exportSource?: IdeaExportSource;
}) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDate, setQuickDate] = useState<string | null>(null);
  const quickRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusId = params.get("focus");
  const now = ideas.nowDate();
  const defaultExportSource = useMemo(
    () =>
      createFakeIdeaExportSource({
        ideas: () => ideas.items,
        now: () => ideas.nowDate(),
      }),
    [ideas],
  );
  const calendarExportSource = exportSource ?? defaultExportSource;

  useEffect(() => {
    void ideas.load();
    void projects.load();
  }, [ideas, projects]);

  useEffect(() => {
    ideas.setProject(projects.selectedId);
  }, [ideas, projects.selectedId]);

  useEffect(() => {
    if (!focusId || !ideas.loaded || ideas.drawerId === focusId) {
      return;
    }
    if (ideas.items.some((idea) => idea.id === focusId)) {
      ideas.openDrawer(focusId);
    }
  }, [focusId, ideas, ideas.loaded, ideas.items]);

  useEffect(() => {
    if (!focusId || !ideas.loaded) {
      return;
    }
    if (ideas.items.some((idea) => idea.id === focusId)) {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("focus");
    setParams(next, { replace: true });
  }, [focusId, ideas.loaded, ideas.items, params, setParams]);

  const closeDrawer = (): void => {
    ideas.closeDrawer();
    if (params.has("focus")) {
      const next = new URLSearchParams(params);
      next.delete("focus");
      setParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = resolveIdeasShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        repeat: event.repeat,
        typing: isTypingTarget(event.target),
        drawerOpen: ideas.drawerOpen,
      });
      if (!command) {
        return;
      }
      // The calendar owns arrows/Enter; row actions would target an invisible
      // cursor, so only capture, search and Escape reach the page there.
      if (
        ideas.view === "calendar" &&
        (command === "next" ||
          command === "previous" ||
          command === "toggle" ||
          command === "edit" ||
          command === "trash")
      ) {
        return;
      }
      switch (command) {
        case "capture":
          event.preventDefault();
          quickRef.current?.focus();
          break;
        case "search":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "next":
          event.preventDefault();
          ideas.moveCursor(1);
          break;
        case "previous":
          event.preventDefault();
          ideas.moveCursor(-1);
          break;
        case "toggle":
          event.preventDefault();
          if (ideas.cursorId) {
            void ideas.toggleDone(ideas.cursorId);
          }
          break;
        case "edit":
          if (ideas.cursorId) {
            event.preventDefault();
            ideas.openDrawer(ideas.cursorId);
          }
          break;
        case "trash":
          if (ideas.cursorId) {
            event.preventDefault();
            void ideas.trashCursor();
          }
          break;
        case "escape":
          event.preventDefault();
          if (ideas.query) {
            ideas.setQuery("");
          } else {
            ideas.setCursor(null);
          }
          break;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ideas]);

  const submitQuickAdd = (): void => {
    const value = quickTitle;
    void ideas
      .quickAdd(value, { dueDate: quickDate ?? undefined })
      .then((created) => {
        if (created) {
          setQuickTitle("");
          setQuickDate(null);
          quickRef.current?.focus();
        }
      });
  };

  const emptyScoped = ideas.scoped.length === 0;
  const showSearchEmpty = emptyScoped && ideas.query.trim().length > 0;
  const drawerIdea = ideas.drawerIdea;
  const drawerSaving =
    drawerIdea !== null &&
    ideas.action === "save" &&
    ideas.actionId === drawerIdea.id;

  return (
    <div className="page ideas-page">
      <div className="page-header">
        <div>
          <h2>{t("ideas.title")}</h2>
          <p className="muted">{t("ideas.subtitle")}</p>
        </div>
        <span className="idea-counts">
          <span className="idea-open-count">
            {t("ideas.openCount", { count: ideas.openCount })}
          </span>
          {ideas.dueTodayCount > 0 ? (
            <span className="idea-open-count is-today">
              {t("ideas.dueTodayCount", { count: ideas.dueTodayCount })}
            </span>
          ) : null}
        </span>
      </div>

      {ideas.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={() => void ideas.refresh()}>
              {t("actions.retry")}
            </Button>
          }
        >
          <span>{ideas.error}</span>
        </Notice>
      ) : null}

      {ideas.actionError ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={ideas.dismissError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{ideas.actionError}</span>
        </Notice>
      ) : null}

      {ideas.problems.length > 0 ? (
        <Notice variant="warning">
          <div>
            <strong>{t("ideas.problemTitle")}</strong>
            <p className="muted small">{t("ideas.problemHint")}</p>
            <ul className="idea-problems">
              {ideas.problems.map((problem) => (
                <li key={problem.path}>
                  <code>{problem.path}</code>
                  <span className="muted small">
                    {" "}
                    · {problem.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Notice>
      ) : null}

      {ideas.lastCompleted ? (
        <Notice
          variant="info"
          action={
            <Button
              variant="link"
              disabled={Boolean(ideas.action)}
              onClick={() => void ideas.undoComplete()}
            >
              {t("ideas.undo")}
            </Button>
          }
        >
          <span>
            {t("ideas.completed", { title: ideas.lastCompleted.title })}
          </span>
        </Notice>
      ) : null}

      {ideas.lastTrashed ? (
        <Notice
          variant="info"
          action={
            <Button
              variant="link"
              disabled={Boolean(ideas.action)}
              onClick={() => void ideas.restoreLast()}
            >
              {t("ideas.undo")}
            </Button>
          }
        >
          <span>{t("ideas.trashed", { title: ideas.lastTrashed.title })}</span>
        </Notice>
      ) : null}

      {ideas.quickAddError ? (
        <Notice variant="error">
          <span>{t("ideas.quickAddFailed")}</span>
          <span className="muted small"> {ideas.quickAddError}</span>
        </Notice>
      ) : null}

      <div className="ideas-toolbar">
        <div
          className="tabs-list ideas-tabs"
          role="tablist"
          aria-label={t("ideas.views")}
        >
          {IDEAS_VIEWS.map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={ideas.view === view}
              aria-controls="ideas-list"
              tabIndex={ideas.view === view ? 0 : -1}
              onClick={() => {
                if (view !== "calendar") {
                  setQuickDate(null);
                }
                ideas.setView(view);
              }}
              onKeyDown={(event) => {
                if (
                  event.key !== "ArrowRight" &&
                  event.key !== "ArrowLeft" &&
                  event.key !== "Home" &&
                  event.key !== "End"
                ) {
                  return;
                }
                event.preventDefault();
                const tabs = Array.from(
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ) ?? [],
                );
                if (tabs.length === 0) {
                  return;
                }
                const index = tabs.indexOf(event.currentTarget);
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                        tabs.length;
                const nextView = IDEAS_VIEWS[nextIndex] ?? "focus";
                if (nextView !== "calendar") {
                  setQuickDate(null);
                }
                ideas.setView(nextView);
                tabs[nextIndex]?.focus();
              }}
            >
              {t(`ideas.view.${view}` as MessageKey)}
            </button>
          ))}
        </div>

        <label className="field ideas-scope">
          <span>{t("ideas.scope")}</span>
          <Select
            value={ideas.scope}
            onChange={(event) =>
              ideas.setScope(event.target.value as IdeaScope)
            }
          >
            <option value="all">{t("ideas.scope.all")}</option>
            <option value="project" disabled={!projects.selectedId}>
              {t("ideas.scope.project")}
            </option>
          </Select>
        </label>

        <div className="ideas-search">
          <label className="sr-only" htmlFor="ideas-search">
            {t("ideas.searchLabel")}
          </label>
          <input
            id="ideas-search"
            ref={searchRef}
            className="input"
            type="search"
            placeholder={t("ideas.searchPlaceholder")}
            value={ideas.query}
            onChange={(event) => ideas.setQuery(event.target.value)}
          />
          {ideas.query ? (
            <Button variant="link" onClick={() => ideas.setQuery("")}>
              {t("ideas.searchClear")}
            </Button>
          ) : null}
        </div>
      </div>

      <form
        className="ideas-quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          submitQuickAdd();
        }}
      >
        <label className="sr-only" htmlFor="ideas-quick-add">
          {t("ideas.quickAddLabel")}
        </label>
        {quickDate ? (
          <span className="idea-chip idea-quick-date">
            {t("ideas.calendar.quickDate", {
              date: formatCalendarDate(quickDate, locale, "short"),
            })}
            <button
              type="button"
              className="idea-quick-date-clear"
              aria-label={t("ideas.calendar.quickDateClear")}
              onClick={() => setQuickDate(null)}
            >
              ×
            </button>
          </span>
        ) : null}
        <input
          id="ideas-quick-add"
          ref={quickRef}
          className="input"
          placeholder={t("ideas.quickAddPlaceholder")}
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
        />
        <Button
          type="submit"
          variant="primary"
          loading={ideas.quickAddBusy}
          disabled={!quickTitle.trim()}
        >
          {t("ideas.quickAddSubmit")}
        </Button>
      </form>
      <p className="muted small">{t("ideas.quickAddHint")}</p>

      <div
        id="ideas-list"
        role="tabpanel"
        tabIndex={0}
        aria-label={t(`ideas.view.${ideas.view}` as MessageKey)}
      >
        {!ideas.loaded ? (
          ideas.error ? null : <Loading label={t("ideas.loading")} />
        ) : ideas.view === "calendar" ? (
          <IdeasCalendar
            ideas={ideas.scoped}
            now={now}
            exportSource={calendarExportSource}
            onCreateForDay={(key) => {
              setQuickDate(key);
              quickRef.current?.focus();
            }}
            onOpenIdea={(ideaId) => ideas.openDrawer(ideaId)}
            onReschedule={(ideaId, patch) => {
              void ideas.save(ideaId, patch);
            }}
          />
        ) : emptyScoped ? (
          showSearchEmpty ? (
            <EmptyState
              title={t("ideas.noMatches")}
              hint={t("ideas.noMatchesHint")}
              action={
                <Button variant="link" onClick={() => ideas.setQuery("")}>
                  {t("ideas.searchClear")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={t("ideas.empty")}
              hint={t("ideas.emptyHint")}
              action={
                <Button variant="link" onClick={() => quickRef.current?.focus()}>
                  {t("ideas.quickAddLabel")}
                </Button>
              }
            />
          )
        ) : ideas.view === "focus" ? (
          <div className="idea-groups">
            {ideas.groups.map((group) => {
              const collapsible = group.key === "done" && !ideas.query.trim();
              const collapsed = collapsible && !ideas.showDone;
              return (
                <section className="idea-group" key={group.key}>
                  <h3 className="idea-group-header">
                    {collapsible ? (
                      <button
                        type="button"
                        className="idea-group-toggle"
                        aria-expanded={!collapsed}
                        onClick={() => ideas.setShowDone(!ideas.showDone)}
                      >
                        {t(groupKeys[group.key])}
                        <span className="idea-group-count">
                          ({group.ideas.length})
                        </span>
                        <span aria-hidden="true">
                          {collapsed ? "▸" : "▾"}
                        </span>
                      </button>
                    ) : (
                      <>
                        {t(groupKeys[group.key])}
                        <span className="idea-group-count">
                          ({group.ideas.length})
                        </span>
                      </>
                    )}
                  </h3>
                  {collapsed ? null : (
                    <ul className="idea-list">
                      {group.ideas.map((idea) => (
                        <IdeaRow
                          key={idea.id}
                          idea={idea}
                          now={now}
                          locale={locale}
                          cursor={idea.id === ideas.cursorId}
                          busy={
                            ideas.actionId === idea.id &&
                            ideas.action !== null
                          }
                          onOpen={() => ideas.openDrawer(idea.id)}
                          onToggle={() => void ideas.toggleDone(idea.id)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <ul className="idea-list idea-list-all">
            {ideas.visible.map((idea) => (
              <IdeaRow
                key={idea.id}
                idea={idea}
                now={now}
                locale={locale}
                cursor={idea.id === ideas.cursorId}
                busy={ideas.actionId === idea.id && ideas.action !== null}
                onOpen={() => ideas.openDrawer(idea.id)}
                onToggle={() => void ideas.toggleDone(idea.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {drawerIdea ? (
        <IdeaDrawer
          key={drawerIdea.id}
          idea={drawerIdea}
          projects={projectOptions(projects.items)}
          saving={drawerSaving}
          error={ideas.actionError}
          onSave={(patch) => ideas.save(drawerIdea.id, patch)}
          onTrash={() => void ideas.trash(drawerIdea.id)}
          onClose={closeDrawer}
        />
      ) : null}
    </div>
  );
});
