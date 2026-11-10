import { useEffect, useId, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useParams } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { connectionAuthApi } from "@/entities/connection/api/connectionAuthApi";
import { engineAvailability } from "@/entities/connection/model/engineAvailability";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { Connection } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type { ProvidersStore } from "@/entities/provider/model/ProvidersStore";
import { RUN_LIST_LIMIT, type RunsStore } from "@/entities/run/model/RunsStore";
import { settingsApi } from "@/entities/settings/api/settingsApi";
import {
  credentialSecretName,
  isCredentialStored,
  normalizeSecretName,
} from "../model/secrets";
import { boundOAuthLines, oauthOutputHints } from "../model/oauthOutput";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { InlineError } from "@/shared/ui/InlineError";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { useFeedback } from "@/shared/ui/Feedback";
import { RunLogPanel } from "@/widgets/run-log-panel/ui/RunLogPanel";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { formatDateTime } from "@/shared/lib/format";

type ScheduleChoice = "manual" | "@hourly" | "@daily" | "custom";
type DetailError = { key?: MessageKey; detail?: string };
type OAuthResult = { ok: boolean; code: string | number };

type ConnectionDetailProps = {
  connections: ConnectionsStore;
  runs: RunsStore;
  providers: ProvidersStore;
  projects: ProjectsStore;
  engine: EngineStore;
};

export function ConnectionDetailPage(props: ConnectionDetailProps) {
  const { id } = useParams();
  // React Router reuses the same element for /connections/A -> /connections/B.
  // Keying the view by id remounts it so per-connection state (deleted, error,
  // confirm dialog, credential drafts, OAuth output) starts clean and an
  // in-flight request for the previous id cannot write into the new one.
  return <ConnectionDetailView key={id ?? ""} id={id ?? ""} {...props} />;
}

const ConnectionDetailView = observer(function ConnectionDetailView({
  id,
  connections,
  runs,
  providers,
  projects,
  engine,
}: ConnectionDetailProps & { id: string }) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const api = useMemo(() => new ConnectionApi(), []);
  const formId = useId();
  const scheduleSelectId = `${formId}-schedule`;
  const customScheduleId = `${formId}-custom-schedule`;
  const scheduleErrorId = `${formId}-schedule-error`;
  const oauthClientId = `${formId}-oauth-client`;
  const oauthOutputId = `${formId}-oauth-output`;
  const credentialFieldId = (field: string) => `${formId}-credential-${field}`;

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<DetailError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [secretsVersion, setSecretsVersion] = useState(0);

  const [scheduleChoice, setScheduleChoice] = useState<ScheduleChoice>("manual");
  const [customSchedule, setCustomSchedule] = useState("");
  const [scheduleInvalid, setScheduleInvalid] = useState(false);
  const [credentialValues, setCredentialValues] = useState<
    Record<string, string>
  >({});
  const [storedSecrets, setStoredSecrets] = useState<Set<string> | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [clientId, setClientId] = useState("");
  const [oauthRunning, setOauthRunning] = useState(false);
  const [oauthLines, setOauthLines] = useState<string[]>([]);
  const [oauthResult, setOauthResult] = useState<OAuthResult | null>(null);

  const customScheduleRef = useRef<HTMLInputElement>(null);
  const deletedBackRef = useRef<HTMLAnchorElement>(null);
  const oauthHintsRef = useRef<HTMLDivElement>(null);
  const oauthOutputRef = useRef<HTMLPreElement>(null);

  const descriptor = connection
    ? providers.find(connection.provider)
    : undefined;
  const oauthModes =
    descriptor?.capabilities.authModes.filter(
      (mode) => mode === "oauth-device" || mode === "oauth-pkce",
    ) ?? [];
  const oauthEnabled = oauthModes.length > 0;
  const connectionRuns = id ? runs.forConnection(id) : [];
  const availability = engineAvailability(engine.phase);
  const engineReady = availability === "ready" && engine.isRunning;
  const engineActionBusy = engine.busy !== null || engine.isUpdating;
  // The installer replaces the agent binaries; connection mutations would race
  // it, so they stay locked until the update window closes.
  const mutationLocked = busy !== null || oauthRunning || engine.isUpdating;
  const oauthHints = useMemo(() => oauthOutputHints(oauthLines), [oauthLines]);

  useEffect(() => {
    if (!id) {
      setLoadError({ key: "detail.notFound" });
      setLoading(false);
      return;
    }
    if (!engineReady) {
      // The local API is served by the agent. Keep whatever was already
      // loaded and wait for the engine effect to retry once it is running.
      setLoading(false);
      setConfirmDelete(false);
      setDeleteError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadError(null);
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
          setLoadError({
            key: "detail.loadError",
            detail: errorMessage(cause),
          });
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
  }, [
    api,
    id,
    providers,
    projects,
    runs,
    engineReady,
    engine.isRunning,
    reloadNonce,
  ]);

  const connectionId = connection?.id;

  useEffect(() => {
    if (!connectionId || !engine.isRunning) {
      setStoredSecrets(null);
      setSecretsLoading(false);
      setSecretsError(null);
      return;
    }
    let cancelled = false;
    setStoredSecrets(null);
    setSecretsLoading(true);
    setSecretsError(null);
    void settingsApi
      .secretNames()
      .then((names) => {
        if (!cancelled) {
          setStoredSecrets(
            new Set(names.map((name) => normalizeSecretName(name))),
          );
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setStoredSecrets(null);
          setSecretsError(errorMessage(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setSecretsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, engine.isRunning, secretsVersion]);

  useEffect(() => {
    if (deleted) {
      deletedBackRef.current?.focus();
    }
  }, [deleted]);

  useEffect(() => {
    if (engineReady) {
      setStartError(null);
    }
  }, [engineReady]);

  useEffect(() => {
    if (oauthHints.url || oauthHints.deviceCode) {
      oauthHintsRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [oauthHints.url, oauthHints.deviceCode]);

  useEffect(() => {
    const node = oauthOutputRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [oauthLines]);

  const act = async (
    name: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (mutationLocked) {
      return;
    }
    setBusy(name);
    try {
      await action();
    } catch (cause) {
      notify(`${id}: ${errorMessage(cause)}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const startEngine = async (): Promise<void> => {
    if (engineActionBusy) {
      return;
    }
    setStartError(null);
    const started = await engine.startEngine();
    if (!started) {
      setStartError(engine.error ?? t("errors.generic"));
    }
  };

  const saveSchedule = (): void => {
    if (!connection || !engineReady || mutationLocked) {
      return;
    }
    const expression =
      scheduleChoice === "custom" ? customSchedule.trim() : scheduleChoice;
    if (!expression) {
      setScheduleInvalid(true);
      customScheduleRef.current?.focus();
      return;
    }
    setScheduleInvalid(false);
    void act("schedule", async () => {
      await api.setSchedule(connection.id, expression);
      setConnection({ ...connection, schedule: expression });
      notify(`${id}: ${t("detail.scheduleSaved")}`, "success");
    });
  };

  const setCredential = (field: string): void => {
    const value = credentialValues[field]?.trim();
    if (!connection || !value || !engineReady || mutationLocked) {
      return;
    }
    void act(`credential:${field}`, async () => {
      await api.setCredential(connection.id, field, value);
      setCredentialValues((current) => ({ ...current, [field]: "" }));
      setStoredSecrets((current) => {
        if (!current) {
          return current;
        }
        const next = new Set(current);
        next.add(credentialSecretName(connection.id, field));
        return next;
      });
      notify(`${id}: ${t("detail.credentialSaved")}`, "success");
    });
  };

  const startOAuth = async (): Promise<void> => {
    if (!connection || !engineReady || mutationLocked) {
      return;
    }
    setOauthRunning(true);
    setOauthLines([]);
    setOauthResult(null);
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await connectionAuthApi.onLine((line) => {
        if (line.connectionId === connection.id) {
          setOauthLines((current) =>
            boundOAuthLines([...current, `${line.stream}: ${line.line}`]),
          );
        }
      });
      const outcome = await connectionAuthApi.start(connection.id, clientId);
      setOauthResult({
        ok: outcome.exitCode === 0,
        code: outcome.exitCode ?? "?",
      });
      if (outcome.exitCode === 0) {
        // The engine wrote conn/<id>/oauth, so the token field is now stored.
        setSecretsVersion((current) => current + 1);
        try {
          await api.test(connection.id);
          notify(`${id}: ${t("connections.testOk")}`, "success");
        } catch (cause) {
          notify(`${t("connections.testFailed")} ${errorMessage(cause)}`, "error");
        }
      }
    } catch (cause) {
      notify(`${id}: ${errorMessage(cause)}`, "error");
    } finally {
      unlisten?.();
      setOauthRunning(false);
    }
  };

  const deleteConnection = (): void => {
    if (!connection || !engineReady || mutationLocked) {
      return;
    }
    void (async () => {
      setBusy("delete");
      setDeleteError(null);
      try {
        await api.remove(connection.id);
        setConfirmDelete(false);
        setDeleted(true);
        void runs.resetLog();
        void connections.load(true);
      } catch (cause) {
        // Keep the dialog open and put the failure where the user clicked;
        // closing it would hide the message behind the page.
        setDeleteError(errorMessage(cause));
      } finally {
        setBusy(null);
      }
    })();
  };

  const loadErrorText = loadError
    ? [loadError.key ? t(loadError.key) : null, loadError.detail]
        .filter(Boolean)
        .join(" ")
    : "";
  const engineActionLabel =
    engine.busy === "start"
      ? t("actions.working")
      : availability === "paused"
        ? t("actions.resume")
        : t("actions.startAgent");
  // `engine.error` is otherwise only shown in the unavailable phase, so a
  // failed resume/start in the paused phase would be silent. `startError`
  // keeps that outcome on screen and is cleared once the engine is ready.
  const engineFailure =
    startError ?? (availability === "unavailable" ? engine.error : null);
  const engineNotice =
    availability !== "ready" ? (
      <Notice
        variant={
          availability === "unavailable" || startError ? "error" : "info"
        }
        action={
          availability === "starting" ? undefined : (
            <Button
              variant="link"
              disabled={engineActionBusy}
              onClick={() => void startEngine()}
            >
              {startError ? t("actions.retry") : engineActionLabel}
            </Button>
          )
        }
      >
        <span>
          {availability === "paused"
            ? t("connections.enginePaused")
            : availability === "starting"
              ? `${t("connections.waiting")} · ${t("footer.engineStarting")}`
              : t("detail.engineUnavailable")}
          {engineFailure ? ` ${engineFailure}` : ""}
        </span>
      </Notice>
    ) : null;

  if (loading) {
    return (
      <div className="page"><h2>{id}</h2><Loading label={t("common.loading")} /></div>
    );
  }

  if (deleted) {
    return (
      <div className="page">
        <h2>{connection?.id ?? id}</h2>
        <Notice variant="info">
          <span>{t("detail.deletedStatus")}</span>
        </Notice>
        <div className="page-actions">
          <Link
            ref={deletedBackRef}
            className="text-link"
            to="/connections"
          >
            {t("detail.back")}
          </Link>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="page">
        <h2>{id || t("detail.notFound")}</h2>
        {engineNotice}
        {loadError ? (
          <Notice
            variant="error"
            action={
              id && engineReady ? (
                <Button
                  variant="link"
                  disabled={loading}
                  onClick={() => setReloadNonce((current) => current + 1)}
                >
                  {t("actions.retry")}
                </Button>
              ) : undefined
            }
          >
            <span>{loadErrorText}</span>
          </Notice>
        ) : engineReady ? (
          <Notice variant="error">
            <span>{t("detail.notFound")}</span>
          </Notice>
        ) : null}
        <div className="page-actions">
          <Link className="table-link" to="/connections">
            {t("detail.back")}
          </Link>
        </div>
      </div>
    );
  }

  const settingsEntries = Object.entries(connection.settings ?? {});
  const latestRun = connectionRuns.reduce<(typeof connectionRuns)[number] | undefined>((latest, run) =>
    !latest || Date.parse(run.startedAt) > Date.parse(latest.startedAt) ? run : latest, undefined);
  const sections = [
    { suffix: "overview", label: t("detail.overview") },
    { suffix: "schedule-section", label: t("detail.schedule") },
    ...(oauthModes.length ? [{ suffix: "oauth-section", label: t("detail.oauth") }] : []),
    ...(descriptor?.configFields.some((field) => field.secret) ? [{ suffix: "credentials-section", label: t("detail.credentials") }] : []),
    { suffix: "runs-section", label: t("detail.runs") },
    { suffix: "danger-section", label: t("detail.delete") },
  ];
  const jumpTo = (suffix: string): void => {
    const heading = document.getElementById(`${formId}-${suffix}`);
    if (heading instanceof HTMLElement) {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start" });
    }
  };

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
          <Link className="table-link" to="/connections">
            {t("detail.back")}
          </Link>
          <Button
            variant="secondary"
            disabled={mutationLocked || !engineReady}
            onClick={() =>
              void act("test", async () => {
                await api.test(connection.id);
                notify(`${id}: ${t("connections.testOk")}`, "success");
              })
            }
          >
            {busy === "test" ? t("actions.working") : t("detail.test")}
          </Button>
          <Button
            variant="primary"
            disabled={mutationLocked || !engineReady}
            onClick={() =>
              void act("run", async () => {
                const result = await api.run(connection.id);
                notify(t("connections.runQueued", { jobId: result.jobId }), "success");
                await runs.load(true);
              })
            }
          >
            {busy === "run" ? t("actions.working") : t("detail.runNow")}
          </Button>
        </div>
      </div>

      {engineNotice}
      {engine.isUpdating ? (
        <Notice variant="info">
          <span>{t("update.installingStatus")}</span>
        </Notice>
      ) : null}

      {loadError ? (
        <Notice
          variant="error"
          action={
            id && engineReady ? (
              <Button
                variant="link"
                disabled={loading}
                onClick={() => setReloadNonce((current) => current + 1)}
              >
                {t("actions.retry")}
              </Button>
            ) : undefined
          }
        >
          <span>{loadErrorText}</span>
        </Notice>
      ) : null}
      {providers.loaded && !descriptor ? (
        <Notice variant="info">
          <span>{t("detail.unknownProvider")}</span>
        </Notice>
      ) : null}
      <nav className="detail-sections" aria-label={t("detail.sections")}>
        {sections.map((section) => (
          <Button key={section.suffix} variant="ghost" onClick={() => jumpTo(section.suffix)}>{section.label}</Button>
        ))}
      </nav>
      <Card className="connection-health">
        <div className="card-header">
          <div>
            <h3>{t("detail.lastKnownRun")}</h3>
            {latestRun ? <p><span className={`run-status run-${latestRun.status}`}>{t(`runStatus.${latestRun.status}`)}</span> <span className="muted">{formatDateTime(latestRun.finishedAt ?? latestRun.startedAt, locale)}</span></p> : <p className="muted">{runs.error ?? (runs.loaded ? t("detail.historyUnknown") : t("common.loading"))}</p>}
          </div>
          {latestRun ? <Button variant="secondary" onClick={() => {
            void runs.openLog(latestRun.id);
            jumpTo("runs-section");
          }}>{t("detail.openLog")}</Button> : runs.error ? <Button variant="secondary" disabled={runs.loading || !engineReady} onClick={() => void runs.load(true)}>{t("actions.retry")}</Button> : null}
        </div>
      </Card>

      <div className="grid">
        <Card>
          <h3 id={`${formId}-overview`} tabIndex={-1}>{t("detail.overview")}</h3>
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
          <h3 id={`${formId}-schedule-section`} tabIndex={-1}>{t("detail.schedule")}</h3>
          <div className="form-grid">
            <div className="field">
              <label className="muted small" htmlFor={scheduleSelectId}>
                {t("detail.schedule")}
              </label>
              <select
                id={scheduleSelectId}
                className="input"
                value={scheduleChoice}
                onChange={(event) => {
                  const choice = event.target.value as ScheduleChoice;
                  setScheduleChoice(choice);
                  if (choice !== "custom") {
                    setScheduleInvalid(false);
                  }
                }}
              >
                <option value="manual">{t("schedule.manual")}</option>
                <option value="@hourly">{t("schedule.hourly")}</option>
                <option value="@daily">{t("schedule.daily")}</option>
                <option value="custom">{t("schedule.custom")}</option>
              </select>
            </div>
            {scheduleChoice === "custom" ? (
              <div className="field">
                <label className="muted small" htmlFor={customScheduleId}>
                  {t("schedule.custom")}
                </label>
                <input
                  ref={customScheduleRef}
                  id={customScheduleId}
                  className="input"
                  value={customSchedule}
                  placeholder={t("schedule.customPlaceholder")}
                  required
                  aria-required="true"
                  aria-invalid={scheduleInvalid || undefined}
                  aria-describedby={
                    scheduleInvalid ? scheduleErrorId : undefined
                  }
                  onChange={(event) => {
                    setCustomSchedule(event.target.value);
                    setScheduleInvalid(false);
                  }}
                />
                {scheduleInvalid ? (
                  <InlineError id={scheduleErrorId}>
                    {t("detail.scheduleErrorCustom")}
                  </InlineError>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={mutationLocked || !engineReady}
              onClick={saveSchedule}
            >
              {busy === "schedule" ? t("actions.working") : t("detail.saveSchedule")}
            </Button>
          </div>
        </Card>
      </div>

      {oauthModes.length > 0 ? (
        <Card>
          <h3 id={`${formId}-oauth-section`} tabIndex={-1}>{t("detail.oauth")}</h3>
          <p className="muted small">{t("detail.oauthHint")}</p>
          <div className="form-grid">
            <label className="field" htmlFor={oauthClientId}>
              <span>{t("detail.oauthClientId")}</span>
              <input
                id={oauthClientId}
                name="oauth-client-id"
                className="input"
                autoComplete="off"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </label>
          </div>
          <div className="form-actions">
            <Button
              variant="primary"
              disabled={mutationLocked || !engineReady}
              onClick={() => void startOAuth()}
            >
              {oauthRunning ? t("detail.oauthRunning") : t("detail.oauthStart")}
            </Button>
          </div>
          {oauthResult ? (
            <Notice variant={oauthResult.ok ? "info" : "error"}>
              <span>
                {t(
                  oauthResult.ok
                    ? "detail.oauthSuccess"
                    : "detail.oauthFailed",
                  { code: oauthResult.code },
                )}
              </span>
              {!oauthResult.ok ? (
                <span className="muted small">{t("detail.oauthFailedHint")}</span>
              ) : null}
            </Notice>
          ) : null}
          {oauthHints.url || oauthHints.deviceCode ? (
            <div ref={oauthHintsRef} role="status" aria-live="polite">
              {oauthHints.url ? (
                <p>
                  <a
                    className="table-link"
                    href={oauthHints.url}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t("detail.oauthOpenUrl")}
                  </a>
                </p>
              ) : null}
              {oauthHints.deviceCode ? (
                <p>
                  <strong>
                    {t("detail.oauthDeviceCode", {
                      code: oauthHints.deviceCode,
                    })}
                  </strong>
                </p>
              ) : null}
            </div>
          ) : null}
          {oauthLines.length > 0 ? (
            <section className="form-section" aria-labelledby={oauthOutputId}>
              <h4 id={oauthOutputId}>{t("detail.oauthOutput")}</h4>
              <pre
                ref={oauthOutputRef}
                className="log-output"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                tabIndex={0}
              >
                {oauthLines.join("\n")}
              </pre>
            </section>
          ) : null}
        </Card>
      ) : null}

      {descriptor?.configFields.some((field) => field.secret) ? (
        <Card>
          <h3 id={`${formId}-credentials-section`} tabIndex={-1}>{t("detail.credentials")}</h3>
          <p className="muted small">{t("detail.credentialsNote")}</p>
          {secretsLoading ? <Loading label={t("detail.credentials")} /> : null}
          {secretsError ? (
            <Notice variant="error" action={<Button variant="link" disabled={!engineReady || secretsLoading} onClick={() => setSecretsVersion((version) => version + 1)}>{t("actions.retry")}</Button>}>
              <span>{t("detail.secretUnknown")} {secretsError}</span>
            </Notice>
          ) : null}
          <div className="form-grid">
            {descriptor.configFields
              .filter((field) => field.secret)
              .map((field) => {
                const fieldId = credentialFieldId(field.key);
                const helpId = `${fieldId}-help`;
                const stateId = `${fieldId}-state`;
                const describedBy =
                  [
                    field.help ? helpId : null,
                    stateId,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined;
                const stored = storedSecrets
                  ? isCredentialStored(
                      storedSecrets,
                      connection.id,
                      field.key,
                      oauthEnabled,
                    )
                  : null;
                return (
                  <div className="field" key={field.key}>
                    <label className="muted small" htmlFor={fieldId}>
                      {field.label}
                    </label>
                    <div className="inline-field">
                      <input
                        id={fieldId}
                        name={`credential-${field.key}`}
                        className="input"
                        type="password"
                        autoComplete="off"
                        value={credentialValues[field.key] ?? ""}
                        placeholder={t("detail.credentialPlaceholder")}
                        aria-describedby={describedBy}
                        onChange={(event) =>
                          setCredentialValues((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        variant="secondary"
                        aria-label={`${t("detail.setCredential")}: ${field.label}`}
                        disabled={
                          mutationLocked ||
                          !engineReady ||
                          !credentialValues[field.key]?.trim()
                        }
                        onClick={() => setCredential(field.key)}
                      >
                        {busy === `credential:${field.key}`
                          ? t("actions.working")
                          : t("detail.setCredential")}
                      </Button>
                    </div>
                    {field.help ? <small id={helpId}>{field.help}</small> : null}
                    <small id={stateId}>
                      {stored === null
                        ? secretsLoading ? t("common.loading") : t("detail.secretUnknown")
                        : stored ? t("detail.secretStored") : t("detail.secretNotSet")}
                    </small>
                  </div>
                );
              })}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="card-header">
          <div>
            <h3 id={`${formId}-runs-section`} tabIndex={-1}>{t("detail.runs")}</h3>
            {runs.loaded && runs.items.length >= RUN_LIST_LIMIT ? (
              <p className="muted small">
                {t("activity.subtitle")} · {runs.items.length}
              </p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            disabled={runs.loading}
            onClick={() => void runs.load(true)}
          >
            {runs.loading ? t("common.loading") : t("actions.refresh")}
          </Button>
        </div>
        {runs.error ? <InlineError>{runs.error}</InlineError> : null}
        {!runs.loaded && !runs.error ? (
          <p className="muted" role="status">
            {t("common.loading")}
          </p>
        ) : runs.loaded && connectionRuns.length === 0 ? (
          <p className="muted">{t("detail.noRuns")}</p>
        ) : runs.loaded && connectionRuns.length > 0 ? (
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
                    <td data-label={t("common.started")}>{formatDateTime(run.startedAt, locale)}</td>
                    <td data-label={t("common.status")}>
                      <span className={`run-status run-${run.status}`}>
                        {t(`runStatus.${run.status}`)}
                      </span>
                    </td>
                    <td data-label={t("activity.counts")}>
                      {run.stats
                        ? `${run.stats.upserted}/${run.stats.seen}`
                        : (run.counts?.items ?? t("common.none"))}
                    </td>
                    <td data-label={t("common.actions")}>
                      <Button
                        variant="secondary"
                        className="btn-small"
                        aria-label={`${t("detail.openLog")}: ${run.id}`}
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
        ) : null}
        {runs.selectedRunId ? <RunLogPanel runs={runs} /> : null}
      </Card>

      <Card className="danger-zone">
        <h3 id={`${formId}-danger-section`} tabIndex={-1}>{t("detail.delete")}</h3>
        <p className="muted small">{t("detail.deleteConfirm")}</p>
        <Button
          variant="danger"
          disabled={mutationLocked || !engineReady}
          onClick={() => {
            setDeleteError(null);
            setConfirmDelete(true);
          }}
        >
          {t("detail.delete")}
        </Button>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        title={t("detail.delete")}
        confirmLabel={
          busy === "delete" ? t("actions.working") : t("detail.confirmDelete")
        }
        cancelLabel={t("common.cancel")}
        danger
        busy={busy === "delete"}
        onConfirm={deleteConnection}
        onCancel={() => {
          if (busy === null && !oauthRunning) {
            setDeleteError(null);
            setConfirmDelete(false);
          }
        }}
      >
        {deleteError ? <InlineError>{deleteError}</InlineError> : null}
        <p><strong>{connection.id}</strong></p>
        <p>{t("detail.deleteConfirm")}</p>
        <p>{t("detail.deleteDanger")}</p>
      </ConfirmDialog>
    </div>
  );
});
