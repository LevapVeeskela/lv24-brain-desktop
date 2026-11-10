import { describe, expect, it } from "vitest";
import type { EngineViewPhase } from "@/entities/engine/model/types";
import { canMutateConnections, engineAvailability } from "./engineAvailability";

describe("connection engine availability", () => {
  const cases: Array<[EngineViewPhase, ReturnType<typeof engineAvailability>]> = [
    ["running", "ready"],
    ["initializing", "starting"],
    ["starting", "starting"],
    ["paused", "paused"],
    ["error", "unavailable"],
    ["stopped", "unavailable"],
    ["unavailable", "unavailable"],
  ];

  it.each(cases)("maps %s to %s", (phase, expected) => {
    expect(engineAvailability(phase)).toBe(expected);
  });

  it("allows mutations only while the agent is running", () => {
    expect(canMutateConnections("running")).toBe(true);
    for (const phase of [
      "initializing",
      "starting",
      "paused",
      "error",
      "stopped",
      "unavailable",
    ] satisfies EngineViewPhase[]) {
      expect(canMutateConnections(phase)).toBe(false);
    }
  });
});
