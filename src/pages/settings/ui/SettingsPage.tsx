import { Tabs } from "@/shared/ui/Tabs";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import { settingsApi } from "@/entities/settings/api/settingsApi";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import { AutostartToggle } from "@/features/autostart-toggle/ui/AutostartToggle";
import { LocaleSwitch } from "@/features/locale-switch/ui/LocaleSwitch";
import { UpdateCheck } from "@/features/update-check/ui/UpdateCheck";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Loading } from "@/shared/ui/Loading";
import { EmptyState } from "@/shared/ui/EmptyState";
import { useI18n } from "@/shared/i18n";
import { errorMessage } from "@/shared/lib/errors";

export const SettingsPage = observer(function SettingsPage({
  engine,
  settings,
}: {
  engine: EngineStore;
  settings: SettingsStore;
}) {
  const { t } = useI18n();
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
