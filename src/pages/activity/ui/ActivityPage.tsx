import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useSearchParams } from "react-router-dom";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { RecordKindBadge } from "@/entities/memory/ui/MemoryBadges";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { RunCounts } from "@/entities/run/ui/RunCounts";
import { RunStatusBadge } from "@/entities/run/ui/RunStatusBadge";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Loading } from "@/shared/ui/Loading";
import { Notice } from "@/shared/ui/Notice";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import {
  ACTIVITY_FILTERS,
  buildActivityDays,
  isActivityFilter,
  type ActivityFilter,
  type ActivityRow,
} from "../model/activity";
import { JournalStore } from "../model/JournalStore";
import { JournalPanel } from "./JournalPanel";

type ActivityView = "runs" | "journal";

const actorKeys: Record<Exclude<ActivityFilter, "all">, MessageKey> = {
  me: "activity.me",
  agents: "activity.agents",
  connections: "activity.connections",
};

export const ActivityPage = observer(function ActivityPage({
  runs,
  memory,
  projects,
  connections,
  engine,
  journal,
}: {
  runs: RunsStore;
  memory: MemoryStore;
  projects: ProjectsStore;
  connections: ConnectionsStore;
  engine: EngineStore;
  journal?: JournalStore;
}) {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [fallbackJournal] = useState(() => new JournalStore());
  const journalStore = journal ?? fallbackJournal;
  const view: ActivityView = params.get("view") === "journal" ? "journal" : "runs";
  const rawFilter = params.get("actor");
  const filter: ActivityFilter = isActivityFilter(rawFilter) ? rawFilter : "all";
  const projectId = projects.selectedId;
  const catchup = memory.catchupProjectId === projectId ? memory.catchup : null;
  const records = catchup
    ? [
        ...catchup.notes,
        ...catchup.decisions,
        ...catchup.attempts,
        ...catchup.handoffs,
      ]
    : [];
  const connectionProjects: Record<string, string | undefined> = {};
  for (const connection of connections.items) {
    connectionProjects[connection.id] = connection.projects?.[0];
  }
  const projectNames: Record<string, string> = {};
  for (const project of projects.items) {
    projectNames[project.id] = project.name;
  }
  const days = buildActivityDays({
    runs: runs.items,
    records,
    connectionProjects,
    projectNames,
    projectId,
    filter,
  });

  useEffect(() => {
    void runs.load(true);
    void runs.resetLog();
    return () => {
      void runs.resetLog();
    };
  }, [runs]);

  useEffect(() => {
    void projects.load();
  }, [projects]);

  useEffect(() => {
    if (engine.isRunning) {
      void connections.load();
    }
  }, [connections, engine.isRunning]);

  useEffect(() => {
    if (projectId && engine.isRunning) {
      void memory.loadCatchup(projectId);
    }
  }, [engine.isRunning, memory, projectId]);

  useEffect(() => {
    if (view === "journal" && projectId && engine.isRunning) {
      void journalStore.load(projectId);
    }
  }, [engine.isRunning, journalStore, projectId, view]);

  const setView = (next: ActivityView): void => {
    const updated = new URLSearchParams(params);
    if (next === "runs") {
      updated.delete("view");
    } else {
      updated.set("view", next);
    }
    setParams(updated, { replace: true });
  };

  const setFilter = (next: ActivityFilter): void => {
    const updated = new URLSearchParams(params);
    if (next === "all") {
      updated.delete("actor");
    } else {
      updated.set("actor", next);
    }
    setParams(updated, { replace: true });
  };

  const refresh = (): void => {
    if (view === "journal") {
      if (projectId) {
        void journalStore.load(projectId, { force: true });
      }
      return;
    }
    void runs.load(true);
    if (projectId) {
      void memory.loadCatchup(projectId, { force: true });
    }
  };
  const busy = view === "journal" ? journalStore.loading : runs.loading;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("activity.title")}</h2>
          <p className="muted">{t("activity.subtitle")}</p>
        </div>
        <Button disabled={busy} onClick={refresh}>
          {busy ? t("common.loading") : t("actions.refresh")}
        </Button>
      </div>

      <div className="tabs-list" role="tablist" aria-label={t("activity.title")}>
        <button
          type="button"
          role="tab"
          id="activity-runs-tab"
          aria-selected={view === "runs"}
          aria-controls="activity-runs"
          tabIndex={view === "runs" ? 0 : -1}
          onClick={() => setView("runs")}
        >
          {t("activity.tab.runs")}
        </button>
        <button
          type="button"
          role="tab"
          id="activity-journal-tab"
          aria-selected={view === "journal"}
          aria-controls="activity-journal"
          tabIndex={view === "journal" ? 0 : -1}
          onClick={() => setView("journal")}
        >
          {t("activity.tab.journal")}
        </button>
      </div>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>{t("errors.engineUnavailable")}</span>
        </Notice>
      ) : null}

      {view === "journal" ? (
        <div
          id="activity-journal"
          role="tabpanel"
          aria-labelledby="activity-journal-tab"
        >
          <JournalPanel projectId={projectId} journal={journalStore} />
        </div>
      ) : (
        <div id="activity-runs" role="tabpanel" aria-labelledby="activity-runs-tab">
      <div className="activity-toolbar">
        <div className="segmented" role="group" aria-label={t("activity.filters")}>
          {ACTIVITY_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`segment ${filter === value ? "active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? t("activity.all") : t(actorKeys[value])}
            </button>
          ))}
        </div>
        {catchup ? (
          <span className="muted small">
            {t("activity.since", {
              time: formatDateTime(catchup.since, locale),
              source: t(
                catchup.sinceSource === "handoff"
                  ? "activity.sinceHandoff"
                  : catchup.sinceSource === "explicit"
                    ? "activity.sinceExplicit"
                    : "activity.sinceDefault",
              ),
            })}
          </span>
        ) : null}
      </div>

      {runs.error ? (
        <Notice
          variant="error"
          action={<Button variant="link" onClick={refresh}>{t("actions.retry")}</Button>}
        >
          <span>{runs.error}</span>
        </Notice>
      ) : null}
      {memory.catchupError ? (
        <Notice variant="error">
          <span>{memory.catchupError}</span>
        </Notice>
      ) : null}
      {!projectId ? (
        <p className="muted small">{t("activity.catchupDisabled")}</p>
      ) : null}

      {(!runs.loaded && runs.loading) ||
      (projectId !== null && memory.catchupLoading && !catchup) ? (
        <Loading label={t("activity.title")} />
      ) : days.length === 0 ? (
        <EmptyState
          title={t("activity.noActivity")}
          hint={t("activity.noActivityHint")}
        />
      ) : (
        <div className="activity-groups">
          {days.map((day) => (
            <section key={day.day} className="activity-day" aria-label={dayLabel(day.day, locale, t)}>
              <h3 className="activity-day-title">{dayLabel(day.day, locale, t)}</h3>
              {day.projects.map((group) => (
                <div key={group.projectId ?? "unassigned"} className="activity-project">
                  <h4 className="activity-project-title">
                    {group.projectName || t("activity.unknownProject")}
                  </h4>
                  <ul className="activity-list">
                    {group.rows.map((row) =>
                      row.type === "run" && row.run ? (
                        <li key={row.key}>
                          <button
                            type="button"
                            className="activity-row activity-run"
                            aria-label={`${t("activity.openRun")}: ${row.run.id}`}
                            onClick={() => void runs.openLog(row.run?.id ?? "")}
                          >
                            <time dateTime={row.time} className="activity-time">
                              {timeLabel(row.time, locale)}
                            </time>
                            <span className="activity-main">
                              <span className="activity-title">{row.title}</span>
                              <span className="muted small">{row.detail}</span>
                              {row.run.projectIds?.length ? (
                                <span className="badge-row">
                                  {row.run.projectIds.map((project) => (
                                    <Badge key={project} tone="neutral">
                                      {project}
                                    </Badge>
                                  ))}
                                </span>
                              ) : null}
                            </span>
                            <RunStatusBadge run={row.run} />
                            <RunCounts run={row.run} />
                            <span className="muted small">
                              {durationLabel(row.run, t)}
                            </span>
                          </button>
                        </li>
                      ) : row.record ? (
                        <li key={row.key}>
                          <Link
                            className="activity-row activity-record"
                            to={`/memory/${row.record.kind}/${encodeURIComponent(row.record.id)}`}
                          >
                            <time dateTime={row.time} className="activity-time">
                              {timeLabel(row.time, locale)}
                            </time>
                            <span className="activity-main">
                              <span className="activity-title">{row.title}</span>
                              <span className="badge-row">
                                <RecordKindBadge kind={row.record.kind} />
                                <Badge>
                                  {row.actor === "other"
                                    ? t("activity.other")
                                    : t(actorKeys[row.actor])}
                                </Badge>
                              </span>
                            </span>
                          </Link>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      <p className="muted small">{t("activity.historyNote")}</p>

      {runs.selectedRunId ? (
        <aside id="run-drawer" className="run-drawer" aria-label={t("activity.openRun")}>
          <div className="row-actions">
            <Button variant="ghost" onClick={() => void runs.resetLog()}>
              {t("common.close")}
            </Button>
          </div>
          <RunLogPanel runs={runs} />
        </aside>
      ) : null}
        </div>
      )}
    </div>
  );
});

function dayLabel(
  day: string,
  locale: string,
  t: (key: MessageKey) => string,
): string {
  if (day === "unknown") {
    return t("activity.dayUnknown");
  }
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return day;
  }
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function timeLabel(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(
  run: ActivityRow["run"],
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  if (!run?.finishedAt) {
    return t("common.none");
  }
  const seconds = Math.max(
    0,
    Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000),
  );
  return t("activity.duration", {
    seconds: Number.isFinite(seconds) ? seconds : 0,
  });
}
