import { describe, expect, it } from "vitest";
import { parseProviders } from "./types";

describe("provider descriptors", () => {
  it("parses the engine descriptor shape", () => {
    const providers = parseProviders([
      {
        provider: "github",
        displayName: "GitHub",
        capabilities: {
          backfill: true,
          incremental: true,
          deletes: false,
          authModes: ["token", "oauth-device"],
          actions: false,
        },
        defaultPublish: "shared",
        configFields: [
          {
            key: "repos",
            label: "Repositories",
            required: true,
            secret: false,
            help: "owner/repo",
          },
          {
            key: "token",
            label: "Token",
            required: true,
            secret: true,
          },
        ],
        backends: ["native"],
        streams: ["github"],
      },
    ]);
    expect(providers[0]?.provider).toBe("github");
    expect(providers[0]?.capabilities.authModes).toEqual([
      "token",
      "oauth-device",
    ]);
    expect(providers[0]?.configFields[1]?.secret).toBe(true);
  });

  it("rejects descriptors without auth modes", () => {
    expect(() =>
      parseProviders([
        {
          provider: "x",
          displayName: "X",
          capabilities: { authModes: [] },
          configFields: [],
        },
      ]),
    ).toThrow(/auth modes/);
  });
});
