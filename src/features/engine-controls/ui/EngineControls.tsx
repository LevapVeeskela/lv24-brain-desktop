import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type { SyncStore } from "@/entities/sync/model/SyncStore";
import { Button } from "@/shared/ui/Button";
import { Tooltip } from "@/shared/ui/Tooltip";
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
    <div className="engine-controls">
    <div className="hero-actions">
      <Tooltip label={t("startup.pauseNote")}><Button
        variant={action === "pause" ? "secondary" : "primary"}
        disabled={primaryDisabled}
        aria-busy={primaryBusy}
        onClick={runPrimary}
      >
        {primaryLabel}
      </Button></Tooltip>
      <Button
        variant={action === "pause" ? "primary" : "secondary"}
        disabled={busy}
        aria-busy={sync.busy}
        onClick={() => {
          if (!busy) {
            void sync.runAll();
          }
        }}
      >
        {sync.busy ? t("sync.queueing") : t("actions.syncAll")}
      </Button>
    </div>
    {sync.busy ? <div className="sync-progress">
      <p role="status" aria-live="polite">
        {sync.cancelRequested ? t("sync.cancelRequested") : sync.progress ? t("sync.progress", {
          attempted: sync.progress.attempted,
          total: sync.progress.total,
          queued: sync.progress.queued,
          failed: sync.progress.failed,
        }) : t("sync.preparing")}
      </p>
      <progress
        aria-label={t("sync.queueing")}
        max={Math.max(1, sync.progress?.total ?? 1)}
        value={sync.progress?.attempted}
      />
      {sync.progress?.currentConnectionId ? <p className="muted small">{t("sync.currentConnection", { id: sync.progress.currentConnectionId })}</p> : null}
      <p className="muted small">{t("sync.acceptedContinue")}</p>
      <Button variant="secondary" disabled={!sync.canCancelRemaining} onClick={() => sync.cancelRemaining()}>
        {t("sync.cancelRemaining")}
      </Button>
    </div> : null}
    </div>
  );
});
