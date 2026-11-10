import type { EngineViewPhase } from "@/entities/engine/model/types";

/**
 * UI-facing availability of connection mutations. Connection management needs
 * a running agent; every other phase either waits for it or explains why the
 * controls are disabled.
 */
export type EngineAvailability = "ready" | "starting" | "paused" | "unavailable";

export function engineAvailability(phase: EngineViewPhase): EngineAvailability {
  switch (phase) {
    case "running":
      return "ready";
    case "initializing":
    case "starting":
      return "starting";
    case "paused":
      return "paused";
    case "error":
    case "stopped":
    case "unavailable":
      return "unavailable";
  }
}

export function canMutateConnections(phase: EngineViewPhase): boolean {
  return engineAvailability(phase) === "ready";
}
