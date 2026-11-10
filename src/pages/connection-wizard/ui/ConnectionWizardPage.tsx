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
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";
import { ConfigureStep } from "./ConfigureStep";
import { ProviderStep } from "./ProviderStep";
import { WizardStepper } from "./WizardStepper";
import { canReturnToStep, type WizardStep } from "../model/steps";
import { ProviderDrafts, type WizardDraft } from "../model/draft";
import {
  validateWizard,
  type ScheduleChoice,
  type WizardValidation,
} from "../model/validation";

type Step = WizardStep;

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

  useEffect(() => {
    if (submitCount > 0 && formInvalid) {
      const form = document.getElementById(`${formId}-form`);
      const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (field) field.focus();
      else errorSummaryRef.current?.focus();
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
        {busy ? <span className="muted">{t("wizard.backToConnections")}</span> : (
          <Link className="table-link" to="/connections">{t("wizard.backToConnections")}</Link>
        )}
      </div>

      <WizardStepper
        current={step}
        hasDraft={provider !== null}
        created={createdId !== null}
        busy={busy}
        onGo={(target) => {
          if (!canReturnToStep(step, target, provider !== null, createdId !== null, busy)) return;
          if (target === "provider") backToProviders();
          else if (target === "configure" && provider) chooseProvider(provider);
        }}
      />

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
        <ProviderStep
          items={filtered}
          query={query}
          loading={providers.loading}
          loaded={providers.loaded}
          error={providers.error}
          engineReady={engineReady}
          searchRef={providerSearchRef}
          onReload={() => void providers.load(true)}
          onChoose={chooseProvider}
          onQueryChange={setQuery}
        />
      ) : null}

      {step === "configure" && provider && validation ? (
        <ConfigureStep
          provider={provider}
          draft={{id, account, baseUrl, authMode, backend, schedule, customSchedule, publish, selectedProjects, settings, secrets}}
          formId={formId}
          draftRestored={draftRestored}
          submitCount={submitCount}
          validation={validation}
          missingLabels={missingFieldLabels()}
          busy={busy}
          engineReady={engineReady}
          updating={engine.isUpdating}
          projects={projects.items}
          headingRef={configureHeadingRef}
          summaryRef={errorSummaryRef}
          onDismissDraft={() => setDraftRestored(false)}
          onBack={backToProviders}
          onSubmit={() => void submit()}
          onChange={(patch) => {
            if (patch.id !== undefined) setId(patch.id);
            if (patch.account !== undefined) setAccount(patch.account);
            if (patch.baseUrl !== undefined) setBaseUrl(patch.baseUrl);
            if (patch.authMode !== undefined) setAuthMode(patch.authMode);
            if (patch.backend !== undefined) setBackend(patch.backend);
            if (patch.schedule !== undefined) setSchedule(patch.schedule);
            if (patch.customSchedule !== undefined) setCustomSchedule(patch.customSchedule);
            if (patch.publish !== undefined) setPublish(patch.publish);
            if (patch.selectedProjects !== undefined) setSelectedProjects(patch.selectedProjects);
            if (patch.settings !== undefined) setSettings(patch.settings);
            if (patch.secrets !== undefined) setSecrets(patch.secrets);
          }}
        />
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
                className="table-link"
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
