import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { EngineControls } from "@/features/engine-controls/ui/EngineControls";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Notice";
import { Button } from "@/shared/ui/Button";
import { useI18n } from "@/shared/i18n";

export const EngineOverview = observer(function EngineOverview({
  engine,
  sync,
}: {
  engine: EngineStore;
  sync: SyncStore;
}) {
  const { t } = useI18n();
  const status = engine.status;

  // The overview must agree with the compact shell indicator. A missing status
  // after a failed refresh is unavailable, not starting, so derive the title
  // from the same UI-facing phase they use.
  let title = t("hero.starting");
  switch (engine.phase) {
    case "running":
      title = status?.engine.owned
        ? t("hero.runningOwned")
        : t("hero.runningExternal");
      break;
    case "paused":
      title = t("hero.paused");
      break;
    case "error":
    case "unavailable":
      title = t("hero.error");
      break;
    case "stopped":
      title = t("hero.idle");
      break;
    default:
      title = t("hero.starting");
  }

  const detail =
    status?.engine.running && status.engine.version && status.engine.port
      ? t("hero.engineOnPort", {
          version: status.engine.version,
          port: status.engine.port,
        })
      : t("hero.trayHint");

  return (
    <Card className="engine-overview">
      <div className="hero">
      <div>
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h3>{title}</h3>
        <p className="muted">{detail}</p>
      </div>
      <EngineControls engine={engine} sync={sync} />
      </div>
      {engine.statusError || engine.engine?.lastError ? (
        <Notice variant="error" action={<Button variant="link" disabled={engine.busy !== null || engine.isUpdating} onClick={() => void engine.refresh()}>{t("actions.retry")}</Button>}>
          <span>{engine.statusError ?? engine.engine?.lastError}</span>
        </Notice>
      ) : null}
      {status?.engine.pid || status?.engine.port ? <details className="engine-diagnostics">
        <summary>{t("common.details")}</summary>
        <dl className="details">
          <dt>{t("engine.pid")}</dt><dd>{status.engine.pid ?? t("common.none")}</dd>
          <dt>{t("engine.port")}</dt><dd>{status.engine.port ?? t("common.none")}</dd>
          <dt>{t("engine.supervised")}</dt><dd>{status.engine.owned ? t("engine.yes") : t("engine.external")}</dd>
        </dl>
      </details> : null}
    </Card>
  );
});
