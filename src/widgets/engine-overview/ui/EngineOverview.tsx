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

  let title = t("hero.starting");
  if (engine.isPaused) {
    title = t("hero.paused");
  } else if (status) {
    switch (status.engine.phase) {
      case "running":
        title = status.engine.owned
          ? t("hero.runningOwned")
          : t("hero.runningExternal");
        break;
      case "starting":
        title = t("hero.starting");
        break;
      case "error":
        title = t("hero.error");
        break;
      case "paused":
        title = t("hero.paused");
        break;
      default:
        title = t("hero.idle");
    }
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
