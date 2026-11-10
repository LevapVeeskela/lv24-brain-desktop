import { useEffect, useId, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
import { engineAvailability } from "@/entities/connection/model/engineAvailability";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { CreateConnectionInput } from "@/entities/connection/model/types";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import type { ProvidersStore } from "@/entities/provider/model/ProvidersStore";
import type {
  AuthMode,
  ProviderDescriptor,
  ProviderPublishPolicy,
} from "@/entities/provider/model/types";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { InlineError } from "@/shared/ui/InlineError";
import { Notice } from "@/shared/ui/Notice";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { ProviderDrafts, type WizardDraft } from "../model/draft";
import {
  validateWizard,
  type ScheduleChoice,
  type WizardValidation,
} from "../model/validation";

type Step = "provider" | "configure" | "done";

interface PostCreateOutcome {
  failures: string[];
  notes: string[];
}

/**
 * The provider descriptor is authoritative for its backends. A newer engine
 * may advertise ids the desktop union does not know yet; they must be sent
 * unchanged instead of being replaced by the engine default. Values that the
 * descriptor does not list are rejected here, never silently downgraded.
 */
function toBackend(
  value: string,
  provider: ProviderDescriptor,
): CreateConnectionInput["backend"] {
  const backend = value.trim();
  if (!backend) {
    return undefined;
  }
  if (!provider.backends.includes(backend)) {
    return undefined;
  }
  return backend as NonNullable<CreateConnectionInput["backend"]>;
}

function authLabel(mode: AuthMode): MessageKey {
  return `auth.${mode}` as MessageKey;
}

function publishLabel(value: ProviderPublishPolicy): MessageKey {
  return `publish.${value}` as MessageKey;
}

function pickFields(
  provider: ProviderDescriptor,
  source: Record<string, string>,
  secret: boolean,
): Record<string, string> {
  return Object.fromEntries(
    provider.configFields
      .filter((field) => field.secret === secret)
      .map((field) => [field.key, source[field.key] ?? ""]),
  );
}

export const ConnectionWizardPage = observer(function ConnectionWizardPage({
  connections,
  projects,
  providers,
  engine,
}: {
  connections: ConnectionsStore;
  projects: ProjectsStore;
  providers: ProvidersStore;
  engine: EngineStore;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const api = useMemo(() => new ConnectionApi(), []);
  const formId = useId();
  const [step, setStep] = useState<Step>("provider");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderDescriptor | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("none");
  const [backend, setBackend] = useState("");
  const [id, setId] = useState("");
  const [account, setAccount] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [schedule, setSchedule] = useState<ScheduleChoice>("manual");
  const [customSchedule, setCustomSchedule] = useState("");
  const [publish, setPublish] = useState<ProviderPublishPolicy>("local-only");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [postCreateFailures, setPostCreateFailures] = useState<string[]>([]);
  const [postCreateNotes, setPostCreateNotes] = useState<string[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);

  const draftsRef = useRef(new ProviderDrafts());
  const submitTokenRef = useRef(0);
  const returnToSearchRef = useRef(false);
  const configureHeadingRef = useRef<HTMLHeadingElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);
  const providerSearchRef = useRef<HTMLInputElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (engine.isRunning) {
      void providers.load(true);
      void projects.load();
    }
  }, [engine.isRunning, projects, providers]);

  useEffect(() => {
    if (step === "configure") {
      configureHeadingRef.current?.focus();
    } else if (step === "done") {
      doneHeadingRef.current?.focus();
    } else if (returnToSearchRef.current) {
      returnToSearchRef.current = false;
      providerSearchRef.current?.focus();
    }
  }, [step]);

  useEffect(
    () => () => {
      // Invalidate any in-flight submit when the page unmounts.
      submitTokenRef.current += 1;
    },
    [],
  );

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
        : (engine.statusError ?? t("wizard.engineUnavailable"));

  const filtered = providers.items.filter((item) => {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      `${item.provider} ${item.displayName}`.toLowerCase().includes(needle)
    );
  });

  const oauth = authMode === "oauth-device" || authMode === "oauth-pkce";

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

  const validation: WizardValidation | null = provider
    ? validateWizard({
        id,
        provider,
        settings,
        secrets,
        oauth,
        schedule,
        customSchedule,
      })
    : null;
  const formInvalid = validation !== null && !validation.valid;
  const showValidation = submitCount > 0 && formInvalid;
  const idError =
    validation?.id === "invalid" ||
    (submitCount > 0 && validation?.id === "empty")
      ? t("wizard.errorId")
      : null;

  useEffect(() => {
    if (submitCount > 0 && formInvalid) {
      errorSummaryRef.current?.focus();
    }
    // Focus only follows an explicit submit attempt, not later edits.
  }, [submitCount]);

  const missingFieldLabels = (): string[] => {
    if (!provider || !validation) {
      return [];
    }
    const labels: string[] = [];
    if (validation.id) {
      labels.push(t("wizard.id"));
    }
    for (const key of [
      ...validation.missingSettings,
      ...validation.missingSecrets,
    ]) {
      const field = provider.configFields.find((item) => item.key === key);
      if (field) {
        labels.push(field.label);
      }
    }
    if (validation.customScheduleInvalid) {
      labels.push(t("schedule.custom"));
    }
    return labels;
  };

  const chooseProvider = (item: ProviderDescriptor): void => {
    if (busy) {
      return;
    }
    submitTokenRef.current += 1;
    const draft = draftsRef.current.read(item.provider);
    setProvider(item);
    setError(null);
    setCreatedId(null);
    setPostCreateFailures([]);
    setPostCreateNotes([]);
    setSubmitCount(0);
    setStep("configure");
    if (draft) {
      setAuthMode(
        item.capabilities.authModes.includes(draft.authMode)
          ? draft.authMode
          : (item.capabilities.authModes[0] ?? "none"),
      );
      setBackend(
        item.backends.includes(draft.backend)
          ? draft.backend
          : (item.backends[0] ?? ""),
      );
      setId(draft.id);
      setAccount(draft.account);
      setBaseUrl(draft.baseUrl);
      setSchedule(draft.schedule);
      setCustomSchedule(draft.customSchedule);
      setPublish(draft.publish);
      setSelectedProjects([...draft.selectedProjects]);
      setSettings(pickFields(item, draft.settings, false));
      setSecrets(pickFields(item, draft.secrets, true));
      setDraftRestored(true);
      return;
    }
    setAuthMode(item.capabilities.authModes[0] ?? "none");
    setBackend(item.backends[0] ?? "");
    setId("");
    setAccount("");
    setBaseUrl("");
    setSchedule("manual");
    setCustomSchedule("");
    setPublish(item.defaultPublish);
    setSelectedProjects([]);
    setSettings(pickFields(item, {}, false));
    setSecrets(pickFields(item, {}, true));
    setDraftRestored(false);
  };

  const saveDraft = (): void => {
    if (!provider) {
      return;
    }
    const draft: WizardDraft = {
      id,
      account,
      baseUrl,
      authMode,
      backend,
      schedule,
      customSchedule,
      publish,
      selectedProjects,
      settings,
      secrets,
    };
    draftsRef.current.write(provider.provider, draft);
  };

  const backToProviders = (): void => {
    if (busy) {
      return;
    }
    submitTokenRef.current += 1;
    saveDraft();
    returnToSearchRef.current = true;
    setStep("provider");
  };

  const applyPostCreate = async (
    target: ProviderDescriptor,
    targetId: string,
  ): Promise<PostCreateOutcome> => {
    const failures: string[] = [];
    const notes: string[] = [];

    for (const field of target.configFields.filter((item) => item.secret)) {
      const value = secrets[field.key]?.trim();
      if (!value) {
        continue;
      }
      try {
        await api.setCredential(targetId, field.key, value);
      } catch (cause) {
        failures.push(`${field.label}: ${errorMessage(cause)}`);
      }
    }

    if (oauth) {
      notes.push(t("wizard.testSkippedOauth"));
    } else {
      try {
        await api.test(targetId);
      } catch (cause) {
        failures.push(`${t("connections.testFailed")} ${errorMessage(cause)}`);
      }
    }

    return { failures, notes };
  };

  const submit = async (): Promise<void> => {
    if (!provider || busy) {
      return;
    }
    const check = validateWizard({
      id,
      provider,
      settings,
      secrets,
      oauth,
      schedule,
      customSchedule,
    });
    if (!check.valid) {
      setSubmitCount((current) => current + 1);
      return;
    }
    const backendValue = toBackend(backend, provider);
    if (backend.trim() !== "" && backendValue === undefined) {
      setError(t("wizard.errorFields"));
      return;
    }
    if (!engineReady) {
      setError(t("wizard.engineUnavailable"));
      return;
    }
    if (engine.isUpdating) {
      setError(t("update.installingStatus"));
      return;
    }

    // Every submit owns a token. If the draft/provider changes or the page
    // unmounts while the request is in flight, the late response must not
    // move the wizard to Done for a different configuration.
    const token = ++submitTokenRef.current;
    setBusy(true);
    setError(null);
    setPostCreateFailures([]);
    setPostCreateNotes([]);
    const connectionId = id.trim();
    const input: CreateConnectionInput = {
      id: connectionId,
      provider: provider.provider,
      backend: backendValue,
      account: account.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      projects: selectedProjects.length > 0 ? selectedProjects : undefined,
      schedule: schedule === "custom" ? customSchedule.trim() : schedule,
      publish,
      settings: Object.fromEntries(
        Object.entries(settings).filter(([, value]) => value.trim() !== ""),
      ),
    };

    try {
      await api.create(input);
    } catch (cause) {
      if (token !== submitTokenRef.current) {
        return;
      }
      setError(errorMessage(cause));
      setBusy(false);
      return;
    }

    // The connection now exists. Credential writes and the test are retried
    // from the Done step instead of creating a duplicate connection. They run
    // even after navigation so a created connection is not left half-set-up.
    await connections.load(true);
    const outcome = await applyPostCreate(provider, connectionId);
    if (token !== submitTokenRef.current) {
      return;
    }
    setCreatedId(connectionId);
    setPostCreateFailures(outcome.failures);
    setPostCreateNotes(outcome.notes);
    setBusy(false);
    setStep("done");
  };

  const retryPostCreate = async (): Promise<void> => {
    if (!provider || !createdId || busy || engine.isUpdating) {
      return;
    }
    if (!engineReady) {
      setError(t("wizard.engineUnavailable"));
      return;
    }
    const token = ++submitTokenRef.current;
    setBusy(true);
    setError(null);
    const outcome = await applyPostCreate(provider, createdId);
    if (token !== submitTokenRef.current) {
      return;
    }
    setPostCreateFailures(outcome.failures);
    setPostCreateNotes(outcome.notes);
    setBusy(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("wizard.title")}</h2>
          <p className="muted">{t("wizard.subtitle")}</p>
        </div>
        <Link
          className="btn btn-secondary"
          to="/connections"
          aria-disabled={busy || undefined}
          tabIndex={busy ? -1 : undefined}
          onClick={(event) => {
            if (busy) {
              event.preventDefault();
            }
          }}
        >
          {t("wizard.backToConnections")}
        </Link>
      </div>

      <ol className="steps">
        {(["provider", "configure", "done"] as const).map((item, index) => (
          <li
            key={item}
            className={`step ${step === item ? "active" : ""}`}
            aria-current={step === item ? "step" : undefined}
          >
            <span>{index + 1}</span>
            {t(`wizard.step.${item}` as MessageKey)}
          </li>
        ))}
      </ol>

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

      {step === "provider" &&
      (engineReady || providers.loaded || providers.items.length > 0) ? (
        <Card>
          <div className="toolbar" role="search">
            <input
              ref={providerSearchRef}
              type="search"
              className="input"
              value={query}
              aria-label={t("wizard.searchLabel")}
              placeholder={t("wizard.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={providers.loading || !engineReady}
              onClick={() => void providers.load(true)}
            >
              {providers.loading ? t("common.loading") : t("actions.refresh")}
            </Button>
          </div>
          {providers.error && engineReady ? (
            <InlineError>{providers.error}</InlineError>
          ) : null}
          {providers.loading && !providers.loaded ? (
            <p className="muted" role="status">
              {t("common.loading")}
            </p>
          ) : filtered.length > 0 ? (
            <div className="provider-grid">
              {filtered.map((item) => (
                <button
                  key={item.provider}
                  type="button"
                  className="provider-card"
                  onClick={() => chooseProvider(item)}
                >
                  <strong>{item.displayName}</strong>
                  <code>{item.provider}</code>
                  <span className="badge-row">
                    {item.capabilities.authModes.map((mode) => (
                      <span className="badge" key={mode}>
                        {t(authLabel(mode))}
                      </span>
                    ))}
                    {(
                      [
                        ["backfill", item.capabilities.backfill],
                        ["incremental", item.capabilities.incremental],
                        ["deletes", item.capabilities.deletes],
                        ["actions", item.capabilities.actions],
                      ] as const
                    )
                      .filter(([, enabled]) => enabled)
                      .map(([name]) => (
                        <span className="badge" key={name}>
                          {name}
                        </span>
                      ))}
                  </span>
                  <span className="muted small">
                    {t("wizard.publish")}:{" "}
                    {t(publishLabel(item.defaultPublish))}
                  </span>
                  {item.backends.length > 1 ? (
                    <span className="muted small">
                      {item.backends.join(" / ")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : providers.loaded ? (
            <div className="empty-state">
              <strong>{t("wizard.noProviders")}</strong>
            </div>
          ) : engineReady ? (
            <p className="muted" role="status">
              {t("common.loading")}
            </p>
          ) : null}
        </Card>
      ) : null}

      {step === "configure" && provider ? (
        <>
          {draftRestored ? (
            <Notice
              variant="info"
              action={
                <Button
                  variant="link"
                  onClick={() => setDraftRestored(false)}
                >
                  {t("actions.dismiss")}
                </Button>
              }
            >
              <span>{t("wizard.draftRestored")}</span>
            </Notice>
          ) : null}

          {/* Keep the focus target mounted after the first submit attempt.
              Otherwise fixing the last invalid field removes the summary while
              it holds focus and drops keyboard users back to the document. */}
          {submitCount > 0 ? (
            <div
              ref={errorSummaryRef}
              id={`${formId}-validation`}
              tabIndex={-1}
            >
              {showValidation ? (
                <Notice variant="error">
                  <span>
                    {t("wizard.errorRequired", {
                      fields: missingFieldLabels().join(", "),
                    })}
                    <br />
                    {t("wizard.errorFields")}
                  </span>
                </Notice>
              ) : null}
            </div>
          ) : null}

          <Card>
            <div className="card-header">
              <div>
                <h3 ref={configureHeadingRef} tabIndex={-1}>
                  {t("wizard.configureTitle", {
                    provider: provider.displayName,
                  })}
                </h3>
                <p className="muted small">{provider.provider}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={backToProviders}
              >
                {t("common.back")}
              </Button>
            </div>

            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="form-grid">
                <div className="field">
                  <span>
                    <label htmlFor={`${formId}-id`}>{t("wizard.id")}</label>
                    <em className="required">{t("common.required")}</em>
                  </span>
                  <input
                    id={`${formId}-id`}
                    className="input"
                    value={id}
                    placeholder={`${provider.provider}-main`}
                    required
                    aria-required="true"
                    aria-invalid={idError ? true : undefined}
                    aria-describedby={
                      idError
                        ? `${formId}-id-hint ${formId}-id-error`
                        : `${formId}-id-hint`
                    }
                    onChange={(event) => setId(event.target.value)}
                  />
                  <small id={`${formId}-id-hint`}>{t("wizard.idHint")}</small>
                  {idError ? (
                    <InlineError id={`${formId}-id-error`}>
                      {idError}
                    </InlineError>
                  ) : null}
                </div>

                <div className="field">
                  <span>
                    <label htmlFor={`${formId}-account`}>
                      {t("wizard.account")}
                    </label>
                    <small>{t("common.optional")}</small>
                  </span>
                  <input
                    id={`${formId}-account`}
                    className="input"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                  />
                </div>

                <div className="field">
                  <span>
                    <label htmlFor={`${formId}-base-url`}>
                      {t("wizard.baseUrl")}
                    </label>
                    <small>{t("common.optional")}</small>
                  </span>
                  <input
                    id={`${formId}-base-url`}
                    className="input"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </div>

                <div
                  className="field"
                  role="group"
                  aria-label={t("wizard.authMode")}
                >
                  <span>{t("wizard.authMode")}</span>
                  {provider.capabilities.authModes.length > 1 ? (
                    <div className="segmented">
                      {provider.capabilities.authModes.map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`segment ${authMode === mode ? "active" : ""}`}
                          aria-pressed={authMode === mode}
                          onClick={() => setAuthMode(mode)}
                        >
                          {t(authLabel(mode))}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="badge">{t(authLabel(authMode))}</span>
                  )}
                </div>

                {provider.backends.length > 1 ? (
                  <div className="field">
                    <span>
                      <label htmlFor={`${formId}-backend`}>backend</label>
                    </span>
                    <select
                      id={`${formId}-backend`}
                      className="input"
                      value={backend}
                      onChange={(event) => setBackend(event.target.value)}
                    >
                      {provider.backends.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="field">
                  <span>
                    <label htmlFor={`${formId}-schedule`}>
                      {t("wizard.schedule")}
                    </label>
                  </span>
                  <select
                    id={`${formId}-schedule`}
                    className="input"
                    value={schedule}
                    onChange={(event) =>
                      setSchedule(event.target.value as ScheduleChoice)
                    }
                  >
                    <option value="manual">{t("schedule.manual")}</option>
                    <option value="@hourly">{t("schedule.hourly")}</option>
                    <option value="@daily">{t("schedule.daily")}</option>
                    <option value="custom">{t("schedule.custom")}</option>
                  </select>
                </div>

                {schedule === "custom" ? (
                  <div className="field">
                    <span>
                      <label htmlFor={`${formId}-custom-schedule`}>
                        {t("schedule.custom")}
                      </label>
                      <em className="required">{t("common.required")}</em>
                    </span>
                    <input
                      id={`${formId}-custom-schedule`}
                      className="input"
                      value={customSchedule}
                      placeholder={t("schedule.customPlaceholder")}
                      required
                      aria-required="true"
                      aria-invalid={
                        validation?.customScheduleInvalid ? true : undefined
                      }
                      aria-describedby={
                        validation?.customScheduleInvalid
                          ? `${formId}-custom-schedule-error`
                          : undefined
                      }
                      onChange={(event) =>
                        setCustomSchedule(event.target.value)
                      }
                    />
                    {validation?.customScheduleInvalid ? (
                      <InlineError id={`${formId}-custom-schedule-error`}>
                        {t("detail.scheduleErrorCustom")}
                      </InlineError>
                    ) : null}
                  </div>
                ) : null}

                <div className="field">
                  <span>
                    <label htmlFor={`${formId}-publish`}>
                      {t("wizard.publish")}
                    </label>
                  </span>
                  <select
                    id={`${formId}-publish`}
                    className="input"
                    value={publish}
                    onChange={(event) =>
                      setPublish(event.target.value as ProviderPublishPolicy)
                    }
                  >
                    <option value="local-only">
                      {t("publish.local-only")}
                    </option>
                    <option value="shared">{t("publish.shared")}</option>
                  </select>
                </div>
              </div>

              {provider.configFields.some((field) => !field.secret) ? (
                <div className="form-section">
                  <h4>{t("wizard.settings")}</h4>
                  <div className="form-grid">
                    {provider.configFields
                      .filter((field) => !field.secret)
                      .map((field) => {
                        const helpId = field.help
                          ? `${formId}-field-${field.key}-help`
                          : undefined;
                        const invalid =
                          submitCount > 0 &&
                          (validation?.missingSettings.includes(field.key) ??
                            false);
                        return (
                          <div className="field" key={field.key}>
                            <span>
                              <label
                                htmlFor={`${formId}-field-${field.key}`}
                              >
                                {field.label}
                              </label>
                              {field.required ? (
                                <em className="required">
                                  {t("common.required")}
                                </em>
                              ) : (
                                <small>{t("common.optional")}</small>
                              )}
                            </span>
                            <input
                              id={`${formId}-field-${field.key}`}
                              className="input"
                              value={settings[field.key] ?? ""}
                              placeholder={field.help}
                              required={field.required}
                              aria-required={field.required || undefined}
                              aria-invalid={invalid || undefined}
                              aria-describedby={
                                [
                                  helpId,
                                  invalid ? `${formId}-validation` : undefined,
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                              onChange={(event) =>
                                setSettings((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                            />
                            {field.help ? (
                              <small id={helpId}>{field.help}</small>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {oauth ? (
                <Notice variant="info">
                  <span>{t("wizard.oauthNote")}</span>
                </Notice>
              ) : provider.configFields.some((field) => field.secret) ? (
                <div className="form-section">
                  <h4>{t("wizard.secrets")}</h4>
                  <p className="muted small">{t("wizard.secretNote")}</p>
                  <div className="form-grid">
                    {provider.configFields
                      .filter((field) => field.secret)
                      .map((field) => {
                        const helpId = field.help
                          ? `${formId}-secret-${field.key}-help`
                          : undefined;
                        const invalid =
                          submitCount > 0 &&
                          (validation?.missingSecrets.includes(field.key) ??
                            false);
                        return (
                          <div className="field" key={field.key}>
                            <span>
                              <label htmlFor={`${formId}-secret-${field.key}`}>
                                {field.label}
                              </label>
                              {field.required ? (
                                <em className="required">
                                  {t("common.required")}
                                </em>
                              ) : (
                                <small>{t("common.optional")}</small>
                              )}
                            </span>
                            <input
                              id={`${formId}-secret-${field.key}`}
                              className="input"
                              type="password"
                              autoComplete="off"
                              value={secrets[field.key] ?? ""}
                              placeholder={t("wizard.secretPlaceholder")}
                              required={field.required}
                              aria-required={field.required || undefined}
                              aria-invalid={invalid || undefined}
                              aria-describedby={
                                [
                                  helpId,
                                  invalid ? `${formId}-validation` : undefined,
                                ]
                                  .filter(Boolean)
                                  .join(" ") || undefined
                              }
                              onChange={(event) =>
                                setSecrets((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                            />
                            {field.help ? (
                              <small id={helpId}>{field.help}</small>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {projects.items.length > 0 ? (
                <div className="form-section">
                  <h4>
                    {t("wizard.projects")} <small>{t("common.optional")}</small>
                  </h4>
                  <div
                    className="checkbox-grid"
                    role="group"
                    aria-label={t("wizard.projects")}
                  >
                    {projects.items.map((project) => (
                      <label className="checkbox" key={project.id}>
                        <input
                          type="checkbox"
                          checked={selectedProjects.includes(project.id)}
                          onChange={(event) =>
                            setSelectedProjects((current) =>
                              event.target.checked
                                ? [...current, project.id]
                                : current.filter(
                                    (item) => item !== project.id,
                                  ),
                            )
                          }
                        />
                        <span>{project.name || project.id}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted small">{t("wizard.noProjects")}</p>
              )}

              <div className="form-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={busy || !engineReady || engine.isUpdating}
                  aria-busy={busy}
                >
                  {busy ? t("wizard.creating") : t("wizard.create")}
                </Button>
              </div>
            </form>
          </Card>
        </>
      ) : null}

      {step === "done" && createdId ? (
        <>
          {postCreateFailures.length > 0 ? (
            <Notice
              variant="error"
              action={
                <Button
                  type="button"
                  variant="link"
                  disabled={busy || !engineReady || engine.isUpdating}
                  onClick={() => void retryPostCreate()}
                >
                  {busy ? t("actions.working") : t("actions.retry")}
                </Button>
              }
            >
              <span>{postCreateFailures.join(" · ")}</span>
            </Notice>
          ) : null}
          {postCreateNotes.length > 0 ? (
            <Notice variant="info">
              <span>{postCreateNotes.join(" · ")}</span>
            </Notice>
          ) : null}
          <Card>
            <h3 ref={doneHeadingRef} tabIndex={-1}>
              {t("wizard.created", { id: createdId })}
            </h3>
            <div className="page-actions">
              <Link
                className="btn btn-primary"
                to={`/connections/${encodeURIComponent(createdId)}`}
              >
                {t("wizard.open")}
              </Link>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => navigate("/connections")}
              >
                {t("wizard.backToConnections")}
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
});
