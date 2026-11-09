import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { Button } from "@/shared/ui/Button";
import { useI18n } from "@/shared/i18n";

export const EngineControls = observer(function EngineControls({
  engine,
  sync,
}: {
  engine: EngineStore;
  sync: SyncStore;
}) {
  const { t } = useI18n();
  const paused = engine.isPaused;
  const busy = engine.busy !== null || sync.busy;

  return (
    <div className="hero-actions">
      <Button
        variant="primary"
        disabled={busy}
        onClick={() =>
          void (paused ? engine.startEngine() : engine.pauseEngine())
        }
      >
        {engine.busy === "start" || engine.busy === "pause"
          ? t("actions.working")
          : paused
            ? t("actions.resume")
            : t("actions.pause")}
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void sync.runAll()}
      >
        {sync.busy ? t("actions.syncing") : t("actions.syncAll")}
      </Button>
    </div>
  );
});
