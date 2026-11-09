import { observer } from "mobx-react-lite";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { AutostartToggle } from "@/features/autostart-toggle/ui/AutostartToggle";
import { OAuthCallbackCard } from "@/features/oauth-callback/ui/OAuthCallbackCard";
import { UpdateCheck } from "@/features/update-check/ui/UpdateCheck";
import { AppHeader } from "@/widgets/app-header/ui/AppHeader";
import { ConnectionsCard } from "@/widgets/connections-card/ui/ConnectionsCard";
import { EngineCard } from "@/widgets/engine-card/ui/EngineCard";
import { EngineOverview } from "@/widgets/engine-overview/ui/EngineOverview";
import { PathsCard } from "@/widgets/paths-card/ui/PathsCard";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Notice";
import { useI18n } from "@/shared/i18n";

export interface DashboardPageProps {
  engine: EngineStore;
  connections: ConnectionsStore;
  sync: SyncStore;
  settings: SettingsStore;
}

export const DashboardPage = observer(function DashboardPage({
  engine,
  connections,
  sync,
  settings,
}: DashboardPageProps) {
  const { t } = useI18n();

  const error = engine.error ?? sync.error;
  const dismissError = engine.error ? engine.dismissError : sync.dismissError;
  const failures = sync.summary?.failures ?? [];

  return (
    <div className="shell">
      <AppHeader engine={engine} />

      <main className="content">
        <EngineOverview engine={engine} sync={sync} />

        {error ? (
          <Notice
            variant="error"
            action={
              <Button variant="link" onClick={dismissError}>
                {t("actions.dismiss")}
              </Button>
            }
          >
            <strong>{t("notices.attention")}</strong>
            <span>{error}</span>
          </Notice>
        ) : null}

        {sync.summary ? (
          <Notice variant="info">
            <strong>
              {t("notices.syncQueued", {
                queued: sync.summary.queued,
                total: sync.summary.total,
              })}
            </strong>
            <span>
              {failures.length > 0
                ? failures
                    .map((failure) => `${failure.connectionId}: ${failure.error}`)
                    .join(" · ")
                : t("notices.syncAccepted")}
            </span>
          </Notice>
        ) : null}

        <div className="grid">
          <EngineCard engine={engine} connections={connections} />
          <PathsCard engine={engine} />
          <ConnectionsCard connections={connections} engine={engine} />
          <AutostartToggle engine={engine} />
          <UpdateCheck settings={settings} />
        </div>

        <OAuthCallbackCard engine={engine} />
      </main>

      <footer className="footer">
        <span>
          {t("footer.desktop", { version: engine.desktopVersion })} ·{" "}
          {engine.version
            ? t("footer.engine", { version: engine.version })
            : t("footer.engineOffline")}
        </span>
        <Button
          variant="link"
          disabled={engine.busy !== null}
          onClick={() => void engine.quit()}
        >
          {t("actions.quit")}
        </Button>
      </footer>
    </div>
  );
});
