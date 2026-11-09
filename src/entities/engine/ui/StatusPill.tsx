import { useI18n, type MessageKey } from "@/shared/i18n";
import type { EnginePhase } from "../model/types";

const statusKeys: Record<EnginePhase, MessageKey> = {
  starting: "status.starting",
  running: "status.running",
  paused: "status.paused",
  error: "status.error",
  stopped: "status.stopped",
};

export function StatusPill({ phase }: { phase: EnginePhase }) {
  const { t } = useI18n();
  return (
    <div className={`status-pill status-${phase}`}>
      <span className="status-dot" aria-hidden="true" />
      {t(statusKeys[phase])}
    </div>
  );
}
