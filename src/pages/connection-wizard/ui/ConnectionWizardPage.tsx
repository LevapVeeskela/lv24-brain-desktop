import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link, useNavigate } from "react-router-dom";
import { ConnectionApi } from "@/entities/connection/api/connectionApi";
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
import { useI18n, type MessageKey } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";

type Step = "provider" | "configure" | "done";
type ScheduleChoice = "manual" | "@hourly" | "@daily" | "custom";

const idPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function authLabel(mode: AuthMode): MessageKey {
  return `auth.${mode}` as MessageKey;
}

function publishLabel(value: ProviderPublishPolicy): MessageKey {
  return `publish.${value}` as MessageKey;
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
  const [step, setStep] = useState<Step>("provider");
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderDescriptor | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("none");
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
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    void providers.load();
    void projects.load();
  }, [providers, projects]);

  const filtered = providers.items.filter((item) => {
    const needle = query.trim().toLowerCase();
    return (
      !needle ||
      `${item.provider} ${item.displayName}`
        .toLowerCase()
        .includes(needle)
    );
  });

  const chooseProvider = (item: ProviderDescriptor): void => {
    setProvider(item);
    setAuthMode(item.capabilities.authModes[0] ?? "none");
    setPublish(item.defaultPublish);
    setId("");
    setAccount("");
    setBaseUrl("");
    setSchedule("manual");
    setCustomSchedule("");
    setSelectedProjects([]);
    setSettings(
      Object.fromEntries(
        item.configFields
          .filter((field) => !field.secret)
          .map((field) => [field.key, ""]),
      ),
    );
    setSecrets(
      Object.fromEntries(
        item.configFields
          .filter((field) => field.secret)
          .map((field) => [field.key, ""]),
      ),
    );
    setError(null);
    setStep("configure");
  };

  const oauth = authMode === "oauth-device" || authMode === "oauth-pkce";

  const requiredFields = provider
    ? provider.configFields.filter(
        (field) =>
          field.required &&
          !field.secret &&
          !settings[field.key]?.trim(),
      )
    : [];

  const missingRequiredSecrets =
    provider && !oauth
      ? provider.configFields.filter(
          (field) =>
            field.secret && field.required && !secrets[field.key]?.trim(),
        )
      : [];

  const canSubmit =
    provider !== null &&
    idPattern.test(id) &&
    requiredFields.length === 0 &&
    missingRequiredSecrets.length === 0 &&
    (schedule !== "custom" || customSchedule.trim().length > 0) &&
    !busy;

  const submit = async (): Promise<void> => {
    if (!provider || !canSubmit) {
      return;
    }
    setBusy(true);
    setError(null);
    setWarnings([]);
    const nonSecretSettings = Object.fromEntries(
      Object.entries(settings).filter(([, value]) => value.trim() !== ""),
    );
    const input: CreateConnectionInput = {
      id,
      provider: provider.provider,
      backend: provider.backends[0] as CreateConnectionInput["backend"],
      account: account.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      projects: selectedProjects.length > 0 ? selectedProjects : undefined,
      schedule: schedule === "custom" ? customSchedule.trim() : schedule,
      publish,
      settings: nonSecretSettings,
    };

    try {
      await api.create(input);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
      return;
    }

    const problems: string[] = [];
    const secretFields = provider.configFields.filter((field) => field.secret);
    for (const field of secretFields) {
      const value = secrets[field.key]?.trim();
      if (!value) {
        continue;
      }
      try {
        await api.setCredential(id, field.key, value);
      } catch (cause) {
        problems.push(`${field.key}: ${errorMessage(cause)}`);
      }
    }

    if (oauth) {
      problems.push(t("wizard.testSkippedOauth"));
    } else {
      try {
        await api.test(id);
      } catch (cause) {
        problems.push(`${t("connections.testFailed")} ${errorMessage(cause)}`);
      }
    }

    await connections.load(true);
    setCreatedId(id);
    setWarnings(problems);
    setBusy(false);
    setStep("done");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("wizard.title")}</h2>
          <p className="muted">{t("wizard.subtitle")}</p>
        </div>
        <Link className="btn btn-secondary" to="/connections">
          {t("wizard.backToConnections")}
        </Link>
      </div>

      <ol className="steps">
        {(["provider", "configure", "done"] as const).map((item, index) => (
          <li
            key={item}
            className={`step ${step === item ? "active" : ""}`}
          >
            <span>{index + 1}</span>
            {t(`wizard.step.${item}` as MessageKey)}
          </li>
        ))}
      </ol>

      {!engine.isRunning ? (
        <Notice variant="info">
          <span>
            {engine.isPaused ? t("connections.paused") : t("connections.waiting")}
          </span>
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

      {step === "provider" ? (
        <Card>
          <div className="toolbar">
            <input
              className="input"
              value={query}
              placeholder={t("wizard.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Button
              variant="secondary"
              disabled={providers.loading}
              onClick={() => void providers.load(true)}
            >
              {providers.loading ? t("common.loading") : t("actions.refresh")}
            </Button>
          </div>
          {providers.error ? (
            <p className="inline-error">{providers.error}</p>
          ) : null}
          {providers.loading && !providers.loaded ? (
            <p className="muted">{t("common.loading")}</p>
          ) : filtered.length === 0 ? (
            <p className="muted">{t("wizard.noProviders")}</p>
          ) : (
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
                  </span>
                  <span className="muted small">
                    {t(publishLabel(item.defaultPublish))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {step === "configure" && provider ? (
        <Card>
          <div className="card-header">
            <div>
              <h3>
                {t("wizard.configureTitle", {
                  provider: provider.displayName,
                })}
              </h3>
              <p className="muted small">{provider.provider}</p>
            </div>
            <Button variant="secondary" onClick={() => setStep("provider")}>
              {t("common.back")}
            </Button>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>{t("wizard.id")}</span>
              <input
                className="input"
                value={id}
                placeholder={`${provider.provider}-main`}
                onChange={(event) => setId(event.target.value.trim())}
              />
              <small>{t("wizard.idHint")}</small>
              {id && !idPattern.test(id) ? (
                <small className="inline-error">{t("wizard.errorId")}</small>
              ) : null}
            </label>
            <label className="field">
              <span>{t("wizard.account")}</span>
              <input
                className="input"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("wizard.baseUrl")}</span>
              <input
                className="input"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>

            <div className="field">
              <span>{t("wizard.authMode")}</span>
              {provider.capabilities.authModes.length > 1 ? (
                <div className="segmented">
                  {provider.capabilities.authModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`segment ${authMode === mode ? "active" : ""}`}
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

            <label className="field">
              <span>{t("wizard.schedule")}</span>
              <select
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
              {schedule === "custom" ? (
                <input
                  className="input"
                  value={customSchedule}
                  placeholder={t("schedule.customPlaceholder")}
                  onChange={(event) => setCustomSchedule(event.target.value)}
                />
              ) : null}
            </label>

            <label className="field">
              <span>{t("wizard.publish")}</span>
              <select
                className="input"
                value={publish}
                onChange={(event) =>
                  setPublish(event.target.value as ProviderPublishPolicy)
                }
              >
                <option value="local-only">{t("publish.local-only")}</option>
                <option value="shared">{t("publish.shared")}</option>
              </select>
            </label>
          </div>

          {provider.configFields.some((field) => !field.secret) ? (
            <div className="form-section">
              <h4>{t("wizard.settings")}</h4>
              <div className="form-grid">
                {provider.configFields
                  .filter((field) => !field.secret)
                  .map((field) => (
                    <label className="field" key={field.key}>
                      <span>
                        {field.label}
                        {field.required ? (
                          <em className="required">
                            {t("wizard.required")}
                          </em>
                        ) : null}
                      </span>
                      <input
                        className="input"
                        value={settings[field.key] ?? ""}
                        placeholder={field.help}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      {field.help ? <small>{field.help}</small> : null}
                    </label>
                  ))}
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
                  .map((field) => (
                    <label className="field" key={field.key}>
                      <span>
                        {field.label}
                        {field.required ? (
                          <em className="required">
                            {t("wizard.required")}
                          </em>
                        ) : null}
                      </span>
                      <input
                        className="input"
                        type="password"
                        autoComplete="off"
                        value={secrets[field.key] ?? ""}
                        placeholder={t("wizard.secretPlaceholder")}
                        onChange={(event) =>
                          setSecrets((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      {field.help ? <small>{field.help}</small> : null}
                    </label>
                  ))}
              </div>
            </div>
          ) : null}

          {projects.items.length > 0 ? (
            <div className="form-section">
              <h4>{t("wizard.projects")}</h4>
              <div className="checkbox-grid">
                {projects.items.map((project) => (
                  <label className="checkbox" key={project.id}>
                    <input
                      type="checkbox"
                      checked={selectedProjects.includes(project.id)}
                      onChange={(event) =>
                        setSelectedProjects((current) =>
                          event.target.checked
                            ? [...current, project.id]
                            : current.filter((item) => item !== project.id),
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
              variant="primary"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {busy ? t("wizard.creating") : t("wizard.create")}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === "done" && createdId ? (
        <Card>
          <h3>{t("wizard.created", { id: createdId })}</h3>
          {warnings.length > 0 ? (
            <Notice variant="info">
              <span>{warnings.join(" · ")}</span>
            </Notice>
          ) : null}
          <div className="page-actions">
            <Link
              className="btn btn-primary"
              to={`/connections/${encodeURIComponent(createdId)}`}
            >
              {t("wizard.open")}
            </Link>
            <Button
              variant="secondary"
              onClick={() => navigate("/connections")}
            >
              {t("wizard.backToConnections")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
});
