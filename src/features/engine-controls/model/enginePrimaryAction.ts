import type { EngineViewPhase } from "@/entities/engine/model/types";

export type EnginePrimaryAction = "start" | "pause" | "wait";

/**
 * The single primary engine action must follow the engine phase, not the
 * persisted pause flag: `pause` is only safe while the agent is running.
 */
export function enginePrimaryAction(
  phase: EngineViewPhase,
): EnginePrimaryAction {
  switch (phase) {
    case "running":
      return "pause";
    case "paused":
    case "error":
    case "stopped":
    case "unavailable":
      return "start";
    case "starting":
    case "initializing":
      return "wait";
    default:
      // A phase added by a newer shell must never fall through to Pause.
      return "start";
  }
}
