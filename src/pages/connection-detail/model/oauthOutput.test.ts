import { describe, expect, it } from "vitest";
import {
  boundOAuthLines,
  OAUTH_OUTPUT_MAX_CHARS,
  OAUTH_OUTPUT_MAX_LINES,
  oauthOutputHints,
} from "./oauthOutput";

describe("oauthOutputHints", () => {
  it("finds the authorization URL and an entered device code", () => {
    expect(
      oauthOutputHints([
        "stdout: Open https://example.com/device and enter the code ABCD-EFGH.",
      ]),
    ).toEqual({
      url: "https://example.com/device",
      deviceCode: "ABCD-EFGH",
    });
  });

  it("accepts device-code assignments and strips URL punctuation", () => {
    expect(
      oauthOutputHints([
        "stdout: user_code=WXYZ-1234",
        "stdout: Visit (https://example.com/verify?user_code=WXYZ-1234).",
      ]),
    ).toEqual({
      url: "https://example.com/verify?user_code=WXYZ-1234",
      deviceCode: "WXYZ-1234",
    });
  });

  it("does not treat device_code secrets as the displayed user code", () => {
    const hints = oauthOutputHints([
      "stdout: device_code=SECRETVALUE123",
      "stdout: no user-facing code here",
    ]);
    expect(hints.deviceCode).toBeUndefined();
  });

  it("never promotes a code embedded in a URL", () => {
    const hints = oauthOutputHints([
      "stdout: https://example.com/callback?code=secret-code",
    ]);
    expect(hints.deviceCode).toBeUndefined();
  });
});

describe("boundOAuthLines", () => {
  it("keeps only the newest lines", () => {
    const lines = Array.from(
      { length: OAUTH_OUTPUT_MAX_LINES + 10 },
      (_, index) => `${index}`,
    );
    const bounded = boundOAuthLines(lines);
    expect(bounded).toHaveLength(OAUTH_OUTPUT_MAX_LINES);
    expect(bounded[0]).toBe("10");
    expect(bounded.at(-1)).toBe(`${OAUTH_OUTPUT_MAX_LINES + 9}`);
  });

  it("caps the total transcript size", () => {
    const lines = Array.from({ length: 40 }, () => "x".repeat(1000));
    const bounded = boundOAuthLines(lines);
    const total = bounded.reduce((sum, line) => sum + line.length + 1, 0);
    expect(total).toBeLessThanOrEqual(OAUTH_OUTPUT_MAX_CHARS);
  });

  it("truncates a single oversized line", () => {
    const bounded = boundOAuthLines(["x".repeat(10_000)]);
    expect(bounded[0]?.length).toBeLessThanOrEqual(4_001);
  });
});
