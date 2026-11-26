import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Project } from "@/entities/project/model/types";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type { IdeaExportSource } from "@/features/ideas-export/model/types";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { isInsideBlockingModal } from "@/shared/lib/shortcuts";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { Select } from "@/shared/ui/Select";
import type { IdeaScope, IdeasStore, IdeasView } from "../model/IdeasStore";
import {
  focusDrawerTarget,
  isNewIdeaRequest,
  shouldClearFocusParam,
} from "../model/focus";
import { isTypingTarget, resolveIdeasShortcut } from "../model/keyboard";
import { IdeaDrawer, type IdeaProjectOption } from "./IdeaDrawer";
import { IdeaRow } from "./IdeaRow";

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
}: {
  ideas: IdeasStore;
  projects: ProjectsStore;
  /**
   * WS9 integration point: the calendar tab's export button consumes this.
   * WS7 injects the real `GET /v1/ideas/ical` source from `RootStore`.
   */
  exportSource?: IdeaExportSource;
}) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [quickTitle, setQuickTitle] = useState("");
  const quickRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dismissedFocusRef = useRef<string | null>(null);
  const focusId = params.get("focus");
  const newIdeaParam = params.get("new");
  const now = ideas.nowDate();

  useEffect(() => {
    void ideas.load();
    void projects.load();
  }, [ideas, projects]);

  useEffect(() => {
    ideas.setProject(projects.selectedId);
  }, [ideas, projects.selectedId]);

  useEffect(() => {
    if (!focusId) {
      dismissedFocusRef.current = null;
      return;
    }
    // One drawer at a time: a new ?focus is ignored while another is open,
    // because replacing it could discard unsaved edits in the current drawer.
    const target = focusDrawerTarget({
      focusId,
      loaded: ideas.loaded,
      ideas: ideas.items,
      drawerId: ideas.drawerId,
      dismissedFocusId: dismissedFocusRef.current,
    });
    if (target) {
      ideas.openDrawer(target);
    }
  }, [focusId, ideas, ideas.loaded, ideas.items, ideas.drawerId]);

  useEffect(() => {
    if (
      !shouldClearFocusParam({
        focusId,
        loaded: ideas.loaded,
        ideas: ideas.items,
      })
    ) {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("focus");
    setParams(next, { replace: true });
  }, [focusId, ideas.loaded, ideas.items, params, setParams]);

  useEffect(() => {
    if (!isNewIdeaRequest(newIdeaParam)) {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
    if (!focusId) {
      quickRef.current?.focus();
    }
  }, [focusId, newIdeaParam, params, setParams]);

  useEffect(() => {
    const id = ideas.cursorId;
    if (!id) {
      return;
    }
    document
      .querySelector<HTMLElement>(`[data-idea-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [ideas.cursorId]);

  const closeDrawer = (): void => {
    dismissedFocusRef.current = focusId;
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
        modalOpen: isInsideBlockingModal(event.target),
      });
      if (!command) {
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
    void ideas.quickAdd(value).then((created) => {
      if (created) {
        setQuickTitle("");
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
          {(["focus", "all"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={ideas.view === view}
              aria-controls="ideas-list"
              tabIndex={ideas.view === view ? 0 : -1}
              onClick={() => ideas.setView(view as IdeasView)}
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
                ideas.setView(nextIndex === 0 ? "focus" : "all");
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
              title={
                ideas.scope === "project"
                  ? t("ideas.emptyProject")
                  : t("ideas.empty")
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
