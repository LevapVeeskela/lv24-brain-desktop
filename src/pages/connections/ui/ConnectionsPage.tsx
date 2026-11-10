import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { engineAvailability } from "@/entities/connection/model/engineAvailability";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { Connection } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Input } from "@/shared/ui/Input";
import { Select } from "@/shared/ui/Select";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { Table } from "@/shared/ui/Table";
import { useFeedback } from "@/shared/ui/Feedback";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { formatDateTime } from "@/shared/lib/format";
import { selectConnections, type ConnectionSort, type HealthFilter } from "../model/health";

export const ConnectionsPage = observer(function ConnectionsPage({
  connections,
  engine,
  runs,
}: {
  connections: ConnectionsStore;
  engine: EngineStore;
  runs: RunsStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const api = useMemo(() => new ConnectionApi(), []);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<HealthFilter>("all");
  const [sort, setSort] = useState<ConnectionSort>("status");
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    // The store also reacts to the engine becoming available; this covers a
    // direct mount while the agent is already running.
    void connections.load();
  }, [connections]);

  const availability = engineAvailability(engine.phase);
  const engineReady = availability === "ready";
  const engineActionBusy = engine.busy !== null || engine.isUpdating;
  const engineActionLabel =
    engine.busy === "start"
      ? t("actions.working")
      : engine.isUpdating
        ? t("actions.installing")
        : availability === "paused"
          ? t("actions.resume")
          : t("actions.startAgent");
  const engineBlockedText =
    availability === "paused"
      ? t("connections.enginePaused")
      : availability === "starting"
        ? t("connections.waiting")
        : (engine.statusError ?? t("connections.engineUnavailable"));
  const mutationsDisabled =
    !engineReady || busy !== null || engine.isUpdating;

  useEffect(() => {
    if (engineReady) void runs.load(true);
    return () => { void runs.resetLog(); };
  }, [engineReady, runs]);

  useEffect(() => {
    if (engineReady) {
      setStartError(null);
    }
  }, [engineReady]);

  const startAgent = async (): Promise<void> => {
    setStartError(null);
    const started = await engine.startEngine();
    if (!started) {
      setStartError(engine.error ?? t("errors.engineUnavailable"));
    }
  };

  const filtered = selectConnections(connections.items, runs.items, query, filter, sort);
  const refresh = () => {
    void connections.load(true);
    void runs.load(true);
  };

  const act = async (
    connection: Connection,
    action: "run" | "test",
  ): Promise<void> => {
    if (!engineReady || engine.isUpdating || busy !== null) {
      return;
    }
    const key = `${connection.id}:${action}`;
    setBusy(key);
    try {
      if (action === "run") {
        const result = await api.run(connection.id);
        notify(t("connections.runQueued", { jobId: result.jobId }), "success");
      } else {
        await api.test(connection.id);
        notify(`${connection.id}: ${t("connections.testOk")}`, "success");
      }
    } catch (cause) {
      notify(
        action === "test"
            ? `${connection.id}: ${t("connections.testFailed")} ${errorMessage(cause)}`
            : `${connection.id}: ${errorMessage(cause)}`,
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const showCard =
    connections.items.length > 0 ||
    connections.loading ||
    connections.loaded ||
    availability === "starting";

  const renderBody = () => {
    if (
      connections.loading &&
      !connections.loaded &&
      connections.items.length === 0
    ) {
      return <Loading label={t("connections.loading")} />;
    }

    if (filtered.length > 0) {
      return (
        <div aria-busy={connections.loading || undefined}>
          <Table className="connections-table" caption={t("connections.subtitle")}>
            <thead>
              <tr>
                <th scope="col">{t("common.name")}</th>
                <th scope="col">{t("connections.health")}</th>
                <th scope="col">{t("connections.lastRun")}</th>
                <th scope="col">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ connection, run }) => {
                const schedule =
                  !connection.schedule || connection.schedule === "manual"
                    ? t("connections.scheduleManual")
                    : connection.schedule;
                return (
                  <tr key={connection.id}>
                    <td data-label={t("common.name")}>
                      <Link
                        className="table-link"
                        to={`/connections/${encodeURIComponent(connection.id)}`}
                      >
                        {connection.id}
                      </Link>
                      {connection.account ? (
                        <span className="table-sub">{connection.account}</span>
                      ) : null}
                      <span className="table-sub">{connection.provider} · {schedule}</span>
                    </td>
                    <td data-label={t("connections.health")}>
                      {run ? (
                        <span className={`run-status run-${run.status}`}>{t(`runStatus.${run.status}`)}</span>
                      ) : <span className="muted small">{runs.loading ? t("common.loading") : t("connections.historyUnknown")}</span>}
                      {run && (run.status === "failed" || run.status === "partial") ? (
                        <span className="table-sub connection-result">
                          <Button variant="link" onClick={() => void runs.openLog(run.id)}>{t("detail.openLog")}</Button>
                        </span>
                      ) : null}
                    </td>
                    <td data-label={t("connections.lastRun")}>
                      {run ? <time dateTime={run.startedAt}>{formatDateTime(run.startedAt, locale)}</time> : t("common.none")}
                    </td>
                    <td data-label={t("common.actions")}>
                      <div className="row-actions">
                        <Button
                          variant="secondary"
                          className="btn-small"
                          disabled={mutationsDisabled}
                          aria-busy={busy === `${connection.id}:run`}
                          aria-label={`${t("connections.runNow")} ${connection.id}`}
                          onClick={() => void act(connection, "run")}
                        >
                          {busy === `${connection.id}:run`
                            ? t("actions.working")
                            : t("connections.runNow")}
                        </Button>
                        <Button
                          variant="secondary"
                          className="btn-small"
                          disabled={mutationsDisabled}
                          aria-busy={busy === `${connection.id}:test`}
                          aria-label={`${t("connections.test")} ${connection.id}`}
                          onClick={() => void act(connection, "test")}
                        >
                          {busy === `${connection.id}:test`
                            ? t("actions.working")
                            : t("connections.test")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      );
    }

    if (!connections.loaded && connections.items.length === 0 && !connections.error) {
      return <Loading label={t("connections.loading")} />;
    }

    if (query.trim() || filter !== "all") {
      return (
        <EmptyState title={t("connections.noMatches")} action={<Button variant="link" onClick={() => { setQuery(""); setFilter("all"); }}>{t("connections.clearFilters")}</Button>} />
      );
    }

    if (connections.loaded && connections.items.length === 0) {
      return (
        <EmptyState title={t("connections.empty")} hint={t("connections.emptyHint")} action={engineReady ? <Link to="/connections/new" className="text-link">{t("connections.add")}</Link> : undefined} />
      );
    }

    return null;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("connections.title")}</h2>
          <p className="muted">{t("connections.subtitle")}</p>
        </div>
        <div className="page-actions">
          <Button
            variant="secondary"
            disabled={connections.loading || !engineReady}
            onClick={refresh}
          >
            {connections.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
          {engineReady ? <Link to="/connections/new" className="text-link">
            {t("connections.add")}
          </Link> : <span className="muted" aria-disabled="true">{t("connections.add")}</span>}
        </div>
      </div>

      {connections.error ? (
        <Notice
          variant="error"
          action={
            <Button
              variant="link"
              disabled={!engineReady || connections.loading}
              onClick={refresh}
            >
              {t("actions.retry")}
            </Button>
          }
        >
          <span>
            {t("connections.error")} {connections.error}
          </span>
        </Notice>
      ) : null}

      {runs.error && engineReady ? (
        <Notice variant="error" action={<Button variant="link" disabled={runs.loading} onClick={() => void runs.load(true)}>{t("actions.retry")}</Button>}>
          <span>{runs.error}</span>
        </Notice>
      ) : null}

      {availability !== "ready" ? (
        <Notice
          variant={
            startError || availability === "unavailable" ? "error" : "info"
          }
          action={
            availability === "starting" && !startError ? undefined : (
              <Button
                variant="link"
                disabled={engineActionBusy}
                onClick={() => void startAgent()}
              >
                {startError ? t("actions.retry") : engineActionLabel}
              </Button>
            )
          }
        >
          <span>{startError ?? engineBlockedText}</span>
        </Notice>
      ) : null}

      {showCard ? (
        <Card>
          <div className="connections-controls">
            {connections.items.length > 8 || query || filter !== "all" ? <>
              <label className="field">
                <span>{t("connections.searchLabel")}</span>
                <Input type="search" value={query} placeholder={t("connections.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
              </label>
              <label className="field">
                <span>{t("connections.filterStatus")}</span>
                <Select value={filter} onChange={(event) => setFilter(event.target.value as HealthFilter)}>
                  <option value="all">{t("connections.allStatuses")}</option>
                  {(["failed", "partial", "running", "success"] as const).map((status) => <option key={status} value={status}>{t(`runStatus.${status}`)}</option>)}
                  <option value="unknown">{t("connections.historyUnknown")}</option>
                </Select>
              </label>
            </> : null}
            {connections.items.length > 1 ? <label className="field">
              <span>{t("connections.sort")}</span>
              <Select value={sort} onChange={(event) => setSort(event.target.value as ConnectionSort)}>
                <option value="name">{t("connections.sortName")}</option>
                <option value="status">{t("connections.sortStatus")}</option>
                <option value="recent">{t("connections.sortRecent")}</option>
              </Select>
            </label> : null}
          </div>
          <p className="muted small">{t("connections.count", { count: filtered.length })}</p>

          {renderBody()}
          {connections.items.length > 0 ? <p className="muted small">{t("connections.historyNote")}</p> : null}
        </Card>
      ) : null}
      {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
    </div>
  );
});
