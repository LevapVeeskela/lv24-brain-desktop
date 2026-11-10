import { useI18n } from "@/shared/i18n";
import { enginePhaseMessageKey, enginePhaseTone } from "../model/labels";
import type { EngineViewPhase } from "../model/types";

export function StatusPill({ phase }: { phase: EngineViewPhase }) {
  const { t } = useI18n();
  return (
    <div
      className={`status-pill status-${enginePhaseTone(phase)}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="status-dot" aria-hidden="true" />
      {t(enginePhaseMessageKey(phase))}
    </div>
  );
}
