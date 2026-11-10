import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import {
  isRunFailure,
  runHealthStatus,
  type RunHealthStatus,
} from "@/entities/run/model/presentation";
import { RunStatusBadge } from "@/entities/run/ui/RunStatusBadge";
import { EngineOverview } from "@/widgets/engine-overview/ui/EngineOverview";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";

const healthPriority: Record<RunHealthStatus, number> = {
  failed: 0,
  partial: 1,
  canceled: 2,
  running: 3,
  unknown: 4,
  success: 5,
};

export interface DashboardPageProps {
  engine: EngineStore;
  connections: ConnectionsStore;
  sync: SyncStore;
  settings: SettingsStore;
  runs: RunsStore;
}

export const DashboardPage = observer(function DashboardPage({
  engine,
  connections,
  sync,
  runs,
}: DashboardPageProps) {
  const { t, locale } = useI18n();
  const [retryFailed, setRetryFailed] = useState(false);

  useEffect(() => {
    if (engine.isRunning) void runs.load(true);
    return () => { void runs.resetLog(); };
  }, [engine.isRunning, runs]);

  const latestRuns = connections.items
    .map((connection) => ({
      connection,
      run: runs.items
        .filter((run) => run.connectionId === connection.id || (!run.connectionId && run.id.startsWith(`${connection.id}-`)))
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0],
    }))
    .sort((left, right) =>
      healthPriority[runHealthStatus(left.run)] - healthPriority[runHealthStatus(right.run)] ||
      left.connection.id.localeCompare(right.connection.id),
    );
  const lastFailure = runs.items
    .filter(isRunFailure)
    .slice()
    .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0];

  useEffect(() => {
    if (!sync.error) {
      setRetryFailed(false);
    }
  }, [sync.error]);

  useEffect(() => {
    if (sync.busy) {
      setRetryFailed(false);
    }
  }, [sync.busy]);

  const failures = sync.summary?.failures ?? [];
  const retrySync = async (): Promise<void> => {
    setRetryFailed(false);
    await sync.runAll();
    if (sync.error || (sync.summary?.failures.length ?? 0) > 0) {
      setRetryFailed(true);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("nav.dashboard")}</h2>
          <p className="muted">{t("dashboard.subtitle")}</p>
        </div>
        <Link to="/connections" className="text-link">{t("nav.connections")} →</Link>
      </div>
      <EngineOverview engine={engine} sync={sync} />

      {engine.error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={engine.dismissError}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <strong>{t("notices.attention")}</strong>
          <span>{engine.error}</span>
        </Notice>
      ) : null}

      {sync.error ? (
        <Notice
          variant="error"
          action={
            <div className="row-actions">
              <Button
                variant="link"
                disabled={sync.syncing}
                onClick={() => void retrySync()}
              >
                {t("actions.retry")}
              </Button>
              <Button
                variant="link"
                onClick={() => {
                  setRetryFailed(false);
                  sync.dismissError();
                }}
              >
                {t("actions.dismiss")}
              </Button>
            </div>
          }
        >
          <span>
            {retryFailed
              ? t("notices.retryFailed")
              : t("notices.syncError")}
            {sync.error ? ` ${sync.error}` : ""}
          </span>
        </Notice>
      ) : null}

      {sync.summary ? (
        failures.length > 0 ? (
          <Notice
            variant="error"
            action={
              <Button
                variant="link"
                disabled={sync.syncing}
                onClick={() => void retrySync()}
              >
                {t("actions.retry")}
              </Button>
            }
          >
            <div>
              <strong>{t("notices.syncSomeFailed")}</strong>
              <p className="muted small">
                {t("notices.syncQueued", {
                  queued: sync.summary.queued,
                  total: sync.summary.total,
                })}
              </p>
              {retryFailed ? (
                <p className="muted small">{t("notices.retryFailed")}</p>
              ) : null}
              <div className="muted small">
                {failures.map((failure) => (
                  <div key={failure.connectionId}>
                    <Link
                      className="table-link"
                      to={`/connections/${encodeURIComponent(failure.connectionId)}`}
                    >
                      {failure.connectionId}
                    </Link>
                    {`: ${failure.error}`}
                  </div>
                ))}
              </div>
            </div>
          </Notice>
        ) : (
          <Notice variant="info">
            <strong>
              {t("notices.syncQueued", {
                queued: sync.summary.queued,
                total: sync.summary.total,
              })}
            </strong>
            <span>{t("notices.syncAccepted")}</span>
          </Notice>
        )
      ) : null}

      <div className="dashboard-grid">
      <Card className="dashboard-failure">
        <h3>{t("dashboard.lastFailure")}</h3>
        {runs.error ? <p className="muted">{runs.error}</p> : !runs.loaded ? <p className="muted" role="status">{engine.isRunning ? t("common.loading") : t("connections.waiting")}</p> : lastFailure ? <div className="connection-row">
          <div className="connection-main">
            <span>{lastFailure.connectionId ?? lastFailure.source}</span>
            <span className="connection-meta">{formatDateTime(lastFailure.startedAt, locale)} · <RunStatusBadge run={lastFailure} /></span>
          </div>
          <Button onClick={() => void runs.openLog(lastFailure.id)}>{t("detail.openLog")}</Button>
        </div> : <p className="muted">{t("dashboard.noFailures")}</p>}
      </Card>
      <Card className="dashboard-health">
        <div className="card-header">
          <div>
            <h3>{t("dashboard.recentHealth")}</h3>
            <p className="muted small">{t("connections.count", { count: connections.count })}</p>
          </div>
          <Button disabled={!engine.isRunning || runs.loading || connections.loading} onClick={() => { void runs.load(true); void connections.load(true); }}>
            {t("actions.refresh")}
          </Button>
        </div>
        {connections.error || runs.error ? <Notice variant="error"><span>{connections.error ?? runs.error}</span></Notice> : null}
        {!connections.loaded && !connections.error ? <p role="status" className="muted">{engine.isRunning ? t("connections.loading") : t("connections.waiting")}</p> : null}
        {connections.loaded && connections.items.length === 0 ? <div className="empty-state">
          <strong>{t("connections.empty")}</strong>
          <span>{t("connections.emptyHint")}</span>
          <Link to="/connections/new" className="text-link">{t("connections.add")}</Link>
        </div> : null}
        {latestRuns.length > 0 ? <ul className="connection-list">
          {latestRuns.slice(0, 5).map(({ connection, run }) => <li className="connection-row" key={connection.id}>
            <div className="connection-main">
              <Link className="table-link" to={`/connections/${encodeURIComponent(connection.id)}`}>{connection.id}</Link>
              <span className="connection-meta">{connection.provider}{run ? ` · ${formatDateTime(run.startedAt, locale)}` : ""}</span>
            </div>
            {run ? <RunStatusBadge run={run} /> : <span className="muted small">{runs.loading ? t("common.loading") : t("connections.historyUnknown")}</span>}
          </li>)}
        </ul> : null}
        {latestRuns.length > 0 ? <p className="muted small">{t("connections.historyNote")}</p> : null}
      </Card>
      </div>
      {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
    </div>
  );
});
