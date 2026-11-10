import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { Button } from "@/shared/ui/Button";
import { useI18n } from "@/shared/i18n";
import { enginePrimaryAction } from "../model/enginePrimaryAction";

export const EngineControls = observer(function EngineControls({
  engine,
  sync,
}: {
  engine: EngineStore;
  sync: SyncStore;
}) {
  const { t } = useI18n();
  const action = enginePrimaryAction(engine.phase);
  const engineBusy = engine.busy === "start" || engine.busy === "pause";
  const primaryBusy =
    engine.busy !== null ||
    engine.isUpdating ||
    engine.phase === "starting" ||
    engine.phase === "initializing";
  const busy = engine.busy !== null || sync.busy || engine.isUpdating;
  const primaryDisabled = busy || action === "wait";

  const primaryLabel = engineBusy
    ? t("actions.working")
    : action === "pause"
      ? t("actions.pause")
      : action === "wait"
        ? t("actions.startingAgent")
        : engine.phase === "paused"
          ? t("actions.resume")
          : t("actions.startAgent");

  const runPrimary = (): void => {
    if (primaryDisabled) {
      return;
    }
    if (action === "pause") {
      void engine.pauseEngine();
    } else if (action === "start") {
      void engine.startEngine();
    }
  };

  return (
    <div className="hero-actions">
      <Button
        variant="primary"
        aria-disabled={primaryDisabled}
        aria-busy={primaryBusy}
        onClick={runPrimary}
      >
        {primaryLabel}
      </Button>
      <Button
        variant="secondary"
        aria-disabled={busy}
        aria-busy={sync.busy}
        onClick={() => {
          if (!busy) {
            void sync.runAll();
          }
        }}
      >
        {sync.busy ? t("actions.syncing") : t("actions.syncAll")}
      </Button>
    </div>
  );
});
