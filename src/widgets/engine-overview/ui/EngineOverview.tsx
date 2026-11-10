import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { EngineControls } from "@/features/engine-controls/ui/EngineControls";
import { Card } from "@/shared/ui/Card";
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

  // The hero must agree with the status pill and EngineCard. A missing status
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
    <Card className="hero">
      <div>
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h2>{title}</h2>
        <p className="muted">{detail}</p>
      </div>
      <EngineControls engine={engine} sync={sync} />
    </Card>
  );
});
