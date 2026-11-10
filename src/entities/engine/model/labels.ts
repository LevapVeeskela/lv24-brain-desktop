import type { MessageKey } from "@/shared/i18n";
import type { EngineViewPhase } from "./types";

const phaseMessageKeys: Record<EngineViewPhase, MessageKey> = {
  initializing: "common.loading",
  starting: "status.starting",
  running: "status.running",
  paused: "status.paused",
  error: "status.error",
  stopped: "status.stopped",
  unavailable: "errors.engineUnavailable",
};

/** Translation key for a UI phase, including the pre-status states. */
export function enginePhaseMessageKey(phase: EngineViewPhase): MessageKey {
  return phaseMessageKeys[phase];
}

/** Visual status class; UI-only phases borrow the closest shell phase. */
export function enginePhaseTone(
  phase: EngineViewPhase,
): "starting" | "running" | "paused" | "error" | "stopped" {
  switch (phase) {
    case "initializing":
      return "starting";
    case "unavailable":
      return "error";
    default:
      return phase;
  }
}
