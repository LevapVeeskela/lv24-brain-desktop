import { describe, expect, it } from "vitest";
import type { EngineViewPhase } from "@/entities/engine/model/types";
import { enginePrimaryAction } from "./enginePrimaryAction";

describe("enginePrimaryAction", () => {
  it("pauses only while the agent is running", () => {
    expect(enginePrimaryAction("running")).toBe("pause");
  });

  it("starts the agent after pause, error, stop or an unavailable status", () => {
    const startPhases: EngineViewPhase[] = [
      "paused",
      "error",
      "stopped",
      "unavailable",
    ];
    for (const phase of startPhases) {
      expect(enginePrimaryAction(phase)).toBe("start");
    }
  });

  it("waits without issuing a pause while starting or loading", () => {
    expect(enginePrimaryAction("starting")).toBe("wait");
    expect(enginePrimaryAction("initializing")).toBe("wait");
  });
});
