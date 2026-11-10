import { describe, expect, it } from "vitest";
import {
  credentialSecretName,
  hasStoredOAuthSession,
  isCredentialStored,
  oauthMetadataSecretName,
  oauthSessionSecretName,
} from "./secrets";

describe("credentialSecretName", () => {
  it("matches the engine credential-store normalization", () => {
    expect(credentialSecretName("github-main", "token")).toBe(
      "CONN_GITHUB_MAIN_TOKEN",
    );
    expect(credentialSecretName("imap_work", "password")).toBe(
      "CONN_IMAP_WORK_PASSWORD",
    );
  });
});

describe("OAuth session secrets", () => {
  it("uses the engine's oauth and oauthmeta keys", () => {
    expect(oauthSessionSecretName("github-main")).toBe(
      "CONN_GITHUB_MAIN_OAUTH",
    );
    expect(oauthMetadataSecretName("github-main")).toBe(
      "CONN_GITHUB_MAIN_OAUTHMETA",
    );
  });

  it("detects a session only when both stored keys exist", () => {
    expect(
      hasStoredOAuthSession(
        new Set(["CONN_GITHUB_MAIN_OAUTH", "CONN_GITHUB_MAIN_OAUTHMETA"]),
        "github-main",
      ),
    ).toBe(true);
    expect(hasStoredOAuthSession(new Set(), "github-main")).toBe(false);
  });

  it("rejects a partial session with only one of the two keys", () => {
    expect(
      hasStoredOAuthSession(new Set(["CONN_GITHUB_MAIN_OAUTH"]), "github-main"),
    ).toBe(false);
    expect(
      hasStoredOAuthSession(
        new Set(["CONN_GITHUB_MAIN_OAUTHMETA"]),
        "github-main",
      ),
    ).toBe(false);
  });

  it("does not claim a stored token without OAuth or a direct secret", () => {
    expect(isCredentialStored(new Set(), "github-main", "token", false)).toBe(
      false,
    );
    expect(
      isCredentialStored(
        new Set(["CONN_GITHUB_MAIN_OAUTH", "CONN_GITHUB_MAIN_OAUTHMETA"]),
        "github-main",
        "token",
        true,
      ),
    ).toBe(true);
    expect(
      isCredentialStored(
        new Set(["CONN_GITHUB_MAIN_OAUTH"]),
        "github-main",
        "token",
        true,
      ),
    ).toBe(false);
    expect(
      isCredentialStored(
        new Set(["CONN_GITHUB_MAIN_OAUTH"]),
        "github-main",
        "password",
        true,
      ),
    ).toBe(false);
  });
});
