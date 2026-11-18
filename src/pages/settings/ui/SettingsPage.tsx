import { Tabs } from "@/shared/ui/Tabs";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { settingsApi } from "@/entities/settings/api/settingsApi";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { AutostartToggle } from "@/features/autostart-toggle/ui/AutostartToggle";
import { LocaleSwitch } from "@/features/locale-switch/ui/LocaleSwitch";
import { UpdateCheck } from "@/features/update-check/ui/UpdateCheck";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { useFeedback } from "@/shared/ui/Feedback";
import { useI18n } from "@/shared/i18n";
import { formatDateTime } from "@/shared/lib/format";
import { errorMessage } from "@/shared/lib/errors";
import { HooksStore } from "../model/HooksStore";

const HOOKS_COMMAND = "brain agents sync --hooks";

/** Clipboard falls back to a hidden textarea where the Async Clipboard API is absent. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) {
    throw new Error("copy failed");
  }
}

export const SettingsPage = observer(function SettingsPage({
  engine,
  settings,
  hooks,
}: {
  engine: EngineStore;
  settings: SettingsStore;
  hooks?: HooksStore;
}) {
  const { t, locale } = useI18n();
  const { notify } = useFeedback();
  const [fallbackHooks] = useState(() => new HooksStore());
  const hooksStore = hooks ?? fallbackHooks;
  const [secrets, setSecrets] = useState<string[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadSecrets = async (): Promise<void> => {
    if (secretsLoading) {
      return;
    }
    setSecretsLoading(true);
    setSecretsError(null);
    try {
      setSecrets(await settingsApi.secretNames());
      setLoaded(true);
    } catch (cause) {
      setSecretsError(errorMessage(cause));
    } finally {
      setSecretsLoading(false);
    }
  };

  useEffect(() => {
    void loadSecrets();
    // Secrets are read once per visit; the refresh button is explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void hooksStore.load();
  }, [hooksStore]);

  const copyHooksCommand = async (): Promise<void> => {
    try {
      await copyText(HOOKS_COMMAND);
      notify(t("settings.hooksCopied"), "success");
    } catch {
      notify(t("settings.hooksCopyFailed"), "error");
    }
  };

  const status = engine.status?.engine;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{t("settings.title")}</h2>
          <p className="muted">{t("settings.subtitle")}</p>
        </div>
      </div>

      <Tabs label={t("settings.title")} items={[
        { id: "preferences", label: t("settings.preferences"), content: <div className="grid">        <Card>
          <h3>{t("settings.language")}</h3>
          <LocaleSwitch />
        </Card>

        <AutostartToggle engine={engine} />
        <UpdateCheck settings={settings} />
</div> },
        { id: "diagnostics", label: t("settings.diagnostics"), content: <div className="page">
        <Card>
          <h3>{t("settings.paths")}</h3>
          <dl className="details paths">
            <dt>{t("settings.machine")}</dt>
            <dd><code>{engine.status?.machine || t("paths.notResolved")}</code></dd>
            <dt>{t("settings.dataDir")}</dt>
            <dd>
              <code>{status?.dataDir ?? t("paths.notResolved")}</code>
            </dd>
            <dt>{t("settings.config")}</dt>
            <dd>
              <code>{status?.configPath ?? t("paths.notResolved")}</code>
            </dd>
            <dt>{t("settings.logs")}</dt>
            <dd>
              <code>{engine.status?.logDir ?? t("paths.notResolved")}</code>
            </dd>
            <dt>{t("settings.binary")}</dt>
            <dd>
              <code>{status?.engineBin ?? t("paths.notFound")}</code>
            </dd>
            <dt>{t("settings.source")}</dt>
            <dd>{status?.engineSource ?? t("common.none")}</dd>
            <dt>{t("settings.updateChannel")}</dt>
            <dd>{status?.updateChannel ?? t("common.none")}</dd>
          </dl>
        </Card>      <Card>
        <div className="card-header">
          <div>
            <h3>{t("settings.hooks")}</h3>
            <p className="muted small">{t("settings.hooksHint")}</p>
          </div>
          <Button
            variant="secondary"
            disabled={hooksStore.loading}
            aria-busy={hooksStore.loading}
            onClick={() => void hooksStore.load(true)}
          >
            {hooksStore.loading
              ? t("settings.hooksLoading")
              : t("settings.hooksRefresh")}
          </Button>
        </div>
        <p className="muted small">{t("settings.hooksSyncHint")}</p>
        <p className="hooks-command">
          <code>{HOOKS_COMMAND}</code>{" "}
          <Button variant="link" onClick={() => void copyHooksCommand()}>
            {t("settings.hooksCopy")}
          </Button>
        </p>
        {hooksStore.error ? (
          <Notice
            variant="error"
            action={
              <Button variant="link" onClick={hooksStore.dismissError}>
                {t("actions.dismiss")}
              </Button>
            }
          >
            <span>{hooksStore.error}</span>
          </Notice>
        ) : null}
        {hooksStore.loading && !hooksStore.loaded ? (
          <Loading label={t("settings.hooks")} />
        ) : null}
        {hooksStore.loaded && hooksStore.items.length === 0 ? (
          <EmptyState title={t("settings.hooksEmpty")} />
        ) : null}
        {hooksStore.items.length > 0 ? (
          <ul className="plain-list hook-list">
            {hooksStore.items.map((hook) => (
              <li key={hook.host}>
                <div className="badge-row">
                  <strong>{hook.host}</strong>
                  <Badge tone={hook.installed ? "success" : "warning"}>
                    {hook.installed
                      ? t("settings.hooksInstalled")
                      : t("settings.hooksMissing")}
                  </Badge>
                  <Badge
                    tone={
                      hook.trusted === null
                        ? "neutral"
                        : hook.trusted
                          ? "success"
                          : "warning"
                    }
                  >
                    {hook.trusted === null
                      ? t("settings.hooksTrustUnknown")
                      : hook.trusted
                        ? t("settings.hooksTrusted")
                        : t("settings.hooksUntrusted")}
                  </Badge>
                  {hook.trustDrift ? (
                    <Badge tone="warning">{t("settings.hooksDrift")}</Badge>
                  ) : null}
                </div>
                <p className="muted small">
                  <code>{hook.path}</code>
                </p>
                <dl className="details">
                  <dt>{t("settings.hooksDetail")}</dt>
                  <dd>{hook.detail}</dd>
                  <dt>{t("settings.hooksLastRun")}</dt>
                  <dd>
                    {hook.lastRun
                      ? formatDateTime(hook.lastRun, locale)
                      : t("settings.hooksNever")}
                  </dd>
                  {hook.lastEvent ? (
                    <>
                      <dt>{t("settings.hooksLastEvent")}</dt>
                      <dd>{hook.lastEvent}</dd>
                    </>
                  ) : null}
                  {hook.lastError ? (
                    <>
                      <dt>{t("settings.hooksLastError")}</dt>
                      <dd>{hook.lastError}</dd>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>      <Card>
        <div className="card-header">
          <div>
            <h3>{t("settings.keychain")}</h3>
            <p className="muted small">{t("settings.keychainNote")}</p>
          </div>
          <Button
            variant="secondary"
            disabled={secretsLoading}
            aria-busy={secretsLoading}
            onClick={() => {
              if (!secretsLoading) {
                void loadSecrets();
              }
            }}
          >
            {secretsLoading
              ? t("settings.secretsLoading")
              : t("settings.refreshSecrets")}
          </Button>
        </div>
        {secretsError ? (
          <Notice variant="error" action={<Button variant="link" disabled={secretsLoading} onClick={() => void loadSecrets()}>{t("actions.retry")}</Button>}>
            <span>{secretsError}</span>
          </Notice>
        ) : null}
        {!secretsError && loaded && secrets.length === 0 ? (
          <EmptyState title={t("settings.secretsEmpty")} hint={t("settings.keychainNote")} />
        ) : null}
        {secretsLoading && !loaded ? <Loading label={t("settings.secretsLoading")} /> : null}
        {secrets.length > 0 ? (
          <ul className="secret-list">
            {secrets.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </Card></div> },
      ]} />
    </div>
  );
});
