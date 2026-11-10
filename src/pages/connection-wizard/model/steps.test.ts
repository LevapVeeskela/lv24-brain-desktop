import { describe, expect, it } from "vitest";
import { canReturnToStep } from "./steps";

describe("wizard step navigation", () => {
  it("allows going back and resuming a retained draft", () => {
    expect(canReturnToStep("configure", "provider", true, false, false)).toBe(true);
    expect(canReturnToStep("provider", "configure", true, false, false)).toBe(true);
  });

  it("blocks configuration without a draft and skipping to done", () => {
    expect(canReturnToStep("provider", "configure", false, false, false)).toBe(false);
    expect(canReturnToStep("configure", "done", true, false, false)).toBe(false);
  });

  it("locks navigation while creating and after creation", () => {
    expect(canReturnToStep("configure", "provider", true, false, true)).toBe(false);
    expect(canReturnToStep("done", "configure", true, true, false)).toBe(false);
    expect(canReturnToStep("provider", "configure", true, true, false)).toBe(false);
  });
});
