import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_REQUIRED_PLATFORMS,
  buildLatestJson,
  githubAssetName,
  platformForArtifact,
} from "./build-latest-json.mjs";

const ARTIFACTS = [
  "LV24 Brain_0.3.0_x64-setup.exe",
  "LV24 Brain_0.3.0_aarch64.app.tar.gz",
  "LV24 Brain_0.3.0_x64.app.tar.gz",
  "LV24 Brain_0.3.0_amd64.AppImage",
  "LV24 Brain_0.3.0_amd64.deb",
  "LV24 Brain_0.3.0_amd64.rpm",
];

test("maps every supported updater artifact", () => {
  assert.deepEqual(ARTIFACTS.map(platformForArtifact), [
    "windows-x86_64",
    "darwin-aarch64",
    "darwin-x86_64",
    "linux-x86_64",
    "linux-x86_64-deb",
    "linux-x86_64-rpm",
  ]);
  assert.equal(platformForArtifact("notes.txt.sig"), null);
});

test("uses GitHub's dot-normalized asset names in URLs", () => {
  assert.equal(
    githubAssetName("LV24 Brain_0.3.0_x64-setup.exe"),
    "LV24.Brain_0.3.0_x64-setup.exe",
  );
});

test("builds the six-platform updater manifest and rejects missing platforms", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lv24-latest-"));
  try {
    for (const name of ARTIFACTS) {
      writeFileSync(path.join(dir, name), "artifact");
      writeFileSync(path.join(dir, `${name}.sig`), `signature:${name}`);
    }
    const manifest = buildLatestJson({
      dir,
      tag: "v0.3.0",
      version: "0.3.0",
      repo: "LevapVeeskela/lv24-brain-desktop",
      notes: "test",
    });
    assert.deepEqual(Object.keys(manifest.platforms).sort(), [
      ...DEFAULT_REQUIRED_PLATFORMS,
    ].sort());
    assert.match(
      manifest.platforms["linux-x86_64-deb"].url,
      /LV24\.Brain_0\.3\.0_amd64\.deb$/,
    );
    assert.doesNotMatch(
      manifest.platforms["linux-x86_64-deb"].url,
      /%20/,
    );

    rmSync(path.join(dir, "LV24 Brain_0.3.0_amd64.deb.sig"));
    assert.throws(
      () =>
        buildLatestJson({
          dir,
          tag: "v0.3.0",
          version: "0.3.0",
          repo: "LevapVeeskela/lv24-brain-desktop",
        }),
      /platform set mismatch/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
