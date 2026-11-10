import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Link } from "react-router-dom";
import type { ConnectionsStore } from "@/entities/connection/model/ConnectionsStore";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SettingsStore } from "@/entities/settings/model/SettingsStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { AutostartToggle } from "@/features/autostart-toggle/ui/AutostartToggle";
import { UpdateCheck } from "@/features/update-check/ui/UpdateCheck";
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
  const [retryFailed, setRetryFailed] = useState(false);

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
    <>
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
                disabled={sync.busy}
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
                disabled={sync.busy}
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

      <div className="grid">
        <EngineCard engine={engine} connections={connections} />
        <PathsCard engine={engine} />
        <ConnectionsCard connections={connections} engine={engine} />
        <AutostartToggle engine={engine} />
        <UpdateCheck settings={settings} />
      </div>
    </>
  );
});
