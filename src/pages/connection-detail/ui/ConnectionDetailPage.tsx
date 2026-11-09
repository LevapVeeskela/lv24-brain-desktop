import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { connectionAuthApi } from "@/entities/connection/api/connectionAuthApi";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { Connection } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type { ProvidersStore } from "@/entities/provider/model/ProvidersStore";
import type { RunsStore } from "@/entities/run/model/RunsStore";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { formatDateTime } from "@/shared/lib/format";

type ScheduleChoice = "manual" | "@hourly" | "@daily" | "custom";

export const ConnectionDetailPage = observer(function ConnectionDetailPage({
  connections,
  runs,
  providers,
  projects,
  engine,
}: {
  connections: ConnectionsStore;
  runs: RunsStore;
  providers: ProvidersStore;
  projects: ProjectsStore;
  engine: EngineStore;
}) {
  const { t, locale } = useI18n();
  const { id: rawId } = useParams();
  const id = rawId ?? "";
  const navigate = useNavigate();
  const api = useMemo(() => new ConnectionApi(), []);

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [scheduleChoice, setScheduleChoice] = useState<ScheduleChoice>("manual");
  const [customSchedule, setCustomSchedule] = useState("");
  const [credentialValues, setCredentialValues] = useState<
    Record<string, string>
  >({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [clientId, setClientId] = useState("");
  const [oauthRunning, setOauthRunning] = useState(false);
  const [oauthLines, setOauthLines] = useState<string[]>([]);
  const [oauthResult, setOauthResult] = useState<string | null>(null);

  const descriptor = connection
    ? providers.find(connection.provider)
    : undefined;
  const oauthModes =
    descriptor?.capabilities.authModes.filter(
      (mode) => mode === "oauth-device" || mode === "oauth-pkce",
    ) ?? [];
  const connectionRuns = id ? runs.forConnection(id) : [];

  useEffect(() => {
    if (!id) {
      setError(t("detail.notFound"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const loaded = await api.get(id);
        if (cancelled) {
          return;
        }
        setConnection(loaded);
        const schedule = loaded.schedule || "manual";
        if (
          schedule === "manual" ||
          schedule === "@hourly" ||
          schedule === "@daily"
        ) {
          setScheduleChoice(schedule);
          setCustomSchedule("");
        } else {
          setScheduleChoice("custom");
          setCustomSchedule(schedule);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    void providers.load();
    void projects.load();
    void runs.load(true);
    void runs.resetLog();
    return () => {
      cancelled = true;
      void runs.resetLog();
    };
  }, [api, id, providers, projects, runs, t]);

  const act = async (name: string, action: () => Promise<void>): Promise<void> => {
    setBusy(name);
    setMessage(null);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const saveSchedule = (): void => {
    if (!connection) {
      return;
    }
    const expression =
      scheduleChoice === "custom" ? customSchedule.trim() : scheduleChoice;
    if (!expression) {
      setError(t("schedule.customPlaceholder"));
      return;
    }
    void act("schedule", async () => {
      await api.setSchedule(connection.id, expression);
      setConnection({ ...connection, schedule: expression });
      setMessage(t("detail.scheduleSaved"));
    });
  };

  const setCredential = (field: string): void => {
    const value = credentialValues[field]?.trim();
    if (!connection || !value) {
      return;
    }
    void act(`credential:${field}`, async () => {
      await api.setCredential(connection.id, field, value);
      setCredentialValues((current) => ({ ...current, [field]: "" }));
      setMessage(t("detail.credentialSaved"));
    });
  };

  const startOAuth = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    setOauthRunning(true);
    setOauthLines([]);
    setOauthResult(null);
    setError(null);
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await connectionAuthApi.onLine((line) => {
        if (line.connectionId === connection.id) {
          setOauthLines((current) =>
            [...current, `${line.stream}: ${line.line}`].slice(-500),
          );
        }
      });
      const outcome = await connectionAuthApi.start(connection.id, clientId);
      setOauthResult(
        t(
          outcome.exitCode === 0
            ? "detail.oauthSuccess"
            : "detail.oauthFailed",
          { code: outcome.exitCode ?? "?" },
        ),
      );
      if (outcome.exitCode === 0) {
        try {
          await api.test(connection.id);
          setMessage(t("connections.testOk"));
        } catch (cause) {
          setError(`${t("connections.testFailed")} ${errorMessage(cause)}`);
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      unlisten?.();
      setOauthRunning(false);
    }
  };

  if (loading) {
    return <p className="muted">{t("common.loading")}</p>;
  }

  if (!connection) {
    return (
      <div className="page">
        <Notice variant="error">
          <span>{error ?? t("detail.notFound")}</span>
        </Notice>
        <Link className="btn btn-secondary" to="/connections">
          {t("detail.back")}
        </Link>
      </div>
    );
  }

  const settingsEntries = Object.entries(connection.settings ?? {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{connection.id}</h2>
          <p className="muted">
            {connection.provider}
            {connection.account ? ` · ${connection.account}` : ""}
            {connection.publish ? ` · ${t(`publish.${connection.publish}`)}` : ""}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-secondary" to="/connections">
            {t("detail.back")}
          </Link>
          <Button
            variant="secondary"
            disabled={busy !== null || !engine.isRunning}
            onClick={() =>
              void act("test", async () => {
                await api.test(connection.id);
                setMessage(t("connections.testOk"));
              })
            }
          >
            {busy === "test" ? t("actions.working") : t("detail.test")}
          </Button>
          <Button
            variant="primary"
            disabled={busy !== null || !engine.isRunning}
            onClick={() =>
              void act("run", async () => {
                const result = await api.run(connection.id);
                setMessage(
                  t("connections.runQueued", { jobId: result.jobId }),
                );
                await runs.load(true);
              })
            }
          >
            {busy === "run" ? t("actions.working") : t("detail.runNow")}
          </Button>
        </div>
      </div>

      {error ? (
        <Notice
          variant="error"
          action={
            <Button variant="link" onClick={() => setError(null)}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{error}</span>
        </Notice>
      ) : null}
      {providers.loaded && !descriptor ? (
        <Notice variant="info">
          <span>{t("detail.unknownProvider")}</span>
        </Notice>
      ) : null}
      {message ? (
        <Notice
          variant="info"
          action={
            <Button variant="link" onClick={() => setMessage(null)}>
              {t("actions.dismiss")}
            </Button>
          }
        >
          <span>{message}</span>
        </Notice>
      ) : null}

      <div className="grid">
        <Card>
          <h3>{t("detail.overview")}</h3>
          <dl className="details">
            <dt>{t("connections.provider")}</dt>
            <dd>{connection.provider}</dd>
            <dt>{t("wizard.account")}</dt>
            <dd>{connection.account ?? t("common.none")}</dd>
            <dt>{t("wizard.baseUrl")}</dt>
            <dd>{connection.baseUrl ?? t("common.none")}</dd>
            <dt>{t("detail.project")}</dt>
            <dd>
              {connection.projects?.length
                ? connection.projects.join(", ")
                : t("common.none")}
            </dd>
            <dt>{t("detail.publish")}</dt>
            <dd>
              {connection.publish ? t(`publish.${connection.publish}`) : t("common.none")}
            </dd>
          </dl>
          {settingsEntries.length > 0 ? (
            <>
              <h4>{t("detail.settings")}</h4>
              <dl className="details">
                {settingsEntries.map(([key, value]) => (
                  <div className="detail-row" key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <code>{value}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </Card>

        <Card>
          <h3>{t("detail.schedule")}</h3>
          <div className="form-grid">
            <label className="field">
              <span>{t("detail.schedule")}</span>
              <select
                className="input"
                value={scheduleChoice}
                onChange={(event) =>
                  setScheduleChoice(event.target.value as ScheduleChoice)
                }
              >
                <option value="manual">{t("schedule.manual")}</option>
                <option value="@hourly">{t("schedule.hourly")}</option>
                <option value="@daily">{t("schedule.daily")}</option>
                <option value="custom">{t("schedule.custom")}</option>
              </select>
              {scheduleChoice === "custom" ? (
                <input
                  className="input"
                  value={customSchedule}
                  placeholder={t("schedule.customPlaceholder")}
                  onChange={(event) => setCustomSchedule(event.target.value)}
                />
              ) : null}
            </label>
          </div>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={saveSchedule}
            >
              {busy === "schedule" ? t("actions.working") : t("detail.saveSchedule")}
            </Button>
          </div>
        </Card>
      </div>

      {oauthModes.length > 0 ? (
        <Card>
          <h3>{t("detail.oauth")}</h3>
          <p className="muted small">{t("detail.oauthHint")}</p>
          <div className="form-grid">
            <label className="field">
              <span>{t("detail.oauthClientId")}</span>
              <input
                className="input"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={oauthRunning}
              onClick={() => void startOAuth()}
            >
              {oauthRunning ? t("detail.oauthRunning") : t("detail.oauthStart")}
            </Button>
          </div>
          {oauthResult ? <p className="muted small">{oauthResult}</p> : null}
          {oauthLines.length > 0 ? (
            <pre className="log-output">
              {oauthLines.join("\n")}
            </pre>
          ) : null}
        </Card>
      ) : null}

      {descriptor?.configFields.some((field) => field.secret) ? (
        <Card>
          <h3>{t("detail.credentials")}</h3>
          <p className="muted small">{t("detail.credentialsNote")}</p>
          <div className="form-grid">
            {descriptor.configFields
              .filter((field) => field.secret)
              .map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <div className="inline-field">
                    <input
                      className="input"
                      type="password"
                      autoComplete="off"
                      value={credentialValues[field.key] ?? ""}
                      placeholder={t("detail.credentialPlaceholder")}
                      onChange={(event) =>
                        setCredentialValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      variant="secondary"
                      disabled={
                        busy !== null || !credentialValues[field.key]?.trim()
                      }
                      onClick={() => setCredential(field.key)}
                    >
                      {busy === `credential:${field.key}`
                        ? t("actions.working")
                        : t("detail.setCredential")}
                    </Button>
                  </div>
                  {field.help ? <small>{field.help}</small> : null}
                </label>
              ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="card-header">
          <h3>{t("detail.runs")}</h3>
          <Button
            variant="secondary"
            disabled={runs.loading}
            onClick={() => void runs.load(true)}
          >
            {runs.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
        </div>
        {runs.error ? <p className="inline-error">{runs.error}</p> : null}
        {connectionRuns.length === 0 ? (
          <p className="muted">{t("detail.noRuns")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("common.started")}</th>
                  <th>{t("common.status")}</th>
                  <th>{t("activity.counts")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {connectionRuns.map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.startedAt, locale)}</td>
                    <td>
                      <span className={`run-status run-${run.status}`}>
                        {t(`runStatus.${run.status}`)}
                      </span>
                    </td>
                    <td>
                      {run.stats
                        ? `${run.stats.upserted}/${run.stats.seen}`
                        : (run.counts?.items ?? t("common.none"))}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        className="btn-small"
                        onClick={() => void runs.openLog(run.id)}
                      >
                        {t("detail.openLog")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
      </Card>

      <Card>
        <h3>{t("detail.delete")}</h3>
        {confirmDelete ? (
          <div className="page-actions">
            <span className="muted small">{t("detail.deleteConfirm")}</span>
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={() =>
                void act("delete", async () => {
                  await api.remove(connection.id);
                  await connections.load(true);
                  navigate("/connections");
                })
              }
            >
              {busy === "delete" ? t("actions.working") : t("detail.confirmDelete")}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
            {t("detail.delete")}
          </Button>
        )}
      </Card>
    </div>
  );
});
