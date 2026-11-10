import { describe, expect, it } from "vitest";
import { parseOAuthCallback } from "./callback";

describe("parseOAuthCallback", () => {
  it("accepts a successful callback and identifies the connection", () => {
    expect(
      parseOAuthCallback(
        "lv24brain://oauth/callback?code=one-time&connection=github-main",
      ),
    ).toEqual({ ok: true, connectionId: "github-main" });
  });

  it("accepts every supported connection parameter", () => {
    expect(
      parseOAuthCallback(
        "lv24brain://oauth/callback?code=x&connection_id=gitlab-main",
      ).connectionId,
    ).toBe("gitlab-main");
    expect(
      parseOAuthCallback(
        "lv24brain://oauth/callback?code=x&connectionId=imap-main",
      ).connectionId,
    ).toBe("imap-main");
  });

  it("reports provider errors and callbacks without a code as failures", () => {
    expect(
      parseOAuthCallback(
        "lv24brain://oauth/callback?error=access_denied&error_description=denied",
      ).ok,
    ).toBe(false);
    expect(
      parseOAuthCallback("lv24brain://oauth/callback?state=only-state").ok,
    ).toBe(false);
  });

  it("returns a sanitized provider error code and description", () => {
    expect(
      parseOAuthCallback(
        "lv24brain://oauth/callback?error=access_denied&error_description=The%20user%20denied%20access.",
      ),
    ).toEqual({
      ok: false,
      connectionId: undefined,
      error: "access_denied",
      errorDescription: "The user denied access.",
    });
  });

  it("drops invalid error codes and flattens control characters", () => {
    const callback = parseOAuthCallback(
      "lv24brain://oauth/callback?error=bad%20code&error_description=Line%20one%0ALine%20two%09.",
    );
    expect(callback.error).toBeUndefined();
    expect(callback.errorDescription).toBe("Line one Line two .");
  });

  it("bounds a long error description", () => {
    const description = "x".repeat(1000);
    const callback = parseOAuthCallback(
      `lv24brain://oauth/callback?error=server_error&error_description=${description}`,
    );
    expect(callback.errorDescription?.length).toBeLessThanOrEqual(240);
  });

  it("does not return the authorization code", () => {
    const result = parseOAuthCallback(
      "lv24brain://oauth/callback?code=must-not-leak",
    );
    expect(Object.keys(result)).not.toContain("code");
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
  });

  it("redacts an authorization code echoed in the error description", () => {
    const result = parseOAuthCallback(
      "lv24brain://oauth/callback?code=must-not-leak&error=invalid_request&error_description=code%20must-not-leak%20was%20rejected",
    );
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(result.errorDescription).toContain("[redacted]");
  });

  it("treats malformed URLs as failures", () => {
    expect(parseOAuthCallback("not a url")).toEqual({
      ok: false,
      connectionId: undefined,
    });
  });
});
