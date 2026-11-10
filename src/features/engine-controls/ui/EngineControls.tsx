import { observer } from "mobx-react-lite";
import type { EngineStore } from "@/entities/engine/model/EngineStore";
import type {
  SyncConnectionState,
  SyncStore,
} from "@/entities/sync/model/SyncStore";
import { Button } from "@/shared/ui/Button";
import { Tooltip } from "@/shared/ui/Tooltip";
import { useI18n, type MessageKey } from "@/shared/i18n";
import { enginePrimaryAction } from "../model/enginePrimaryAction";

const stateLabel: Record<SyncConnectionState, MessageKey> = {
  queued: "runStatus.queued",
  running: "runStatus.running",
  success: "runStatus.success",
  partial: "runStatus.partial",
  failed: "runStatus.failed",
  canceled: "runStatus.canceled",
};

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
  const busy = engine.busy !== null || sync.syncing || engine.isUpdating;
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
        aria-busy={sync.syncing}
        onClick={() => {
          if (!busy) {
            void sync.runAll();
          }
        }}
      >
        {sync.busy
          ? t("sync.queueing")
          : sync.syncing
            ? t("sync.running")
            : t("actions.syncAll")}
      </Button>
    </div>
    {sync.syncing ? <div className="sync-progress">
      <p role="status" aria-live="polite">
        {sync.cancelRequested
          ? t("sync.canceling", { count: sync.activeJobCount })
          : sync.progress
            ? t("sync.progress", {
                attempted: sync.progress.attempted,
                total: sync.progress.total,
                queued: sync.progress.queued,
                failed: sync.progress.failed,
              })
            : t("sync.preparing")}
      </p>
      <progress
        aria-label={t("sync.queueing")}
        max={Math.max(1, sync.progress?.total ?? 1)}
        value={sync.progress?.attempted}
      />
      {sync.connectionProgress.length > 0 ? (
        <ul className="sync-connections" aria-label={t("sync.connectionStates")}>
          {sync.connectionProgress.map(({ connectionId, state }) => (
            <li key={connectionId}>
              <span className="sync-connection-id">{connectionId}</span>
              <span className={`run-status run-${state}`}>
                {t(stateLabel[state])}
              </span>
              {sync.cancelStates[connectionId] === "failed" ? (
                <span className="muted small">{t("sync.cancelFailed")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {sync.progressError ? (
        <p className="muted small">
          {t("sync.progressError", { error: sync.progressError })}
        </p>
      ) : null}
      {sync.progressStale ? (
        <p className="muted small">
          {t("sync.progressStale")}{" "}
          <Button variant="link" onClick={sync.refreshProgress}>
            {t("actions.retry")}
          </Button>
        </p>
      ) : null}
      <p className="muted small">{t("sync.acceptedContinue")}</p>
      <Button
        variant="secondary"
        disabled={!sync.canCancel || sync.cancelRequested}
        aria-busy={sync.cancelRequested && sync.hasActiveJobs}
        onClick={() => void sync.cancelAll()}
      >
        {sync.cancelRequested ? t("sync.cancelingButton") : t("sync.cancel")}
      </Button>
    </div> : null}
    </div>
  );
});
