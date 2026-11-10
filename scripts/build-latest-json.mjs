#!/usr/bin/env node
// Build a Tauri v2 updater manifest (latest.json) from signed bundle artifacts.
//
// The Tauri updater writes one `<artifact>.sig` file next to every updater
// artifact. This script maps those artifacts to Tauri updater platform keys,
// builds the public release URLs and writes the JSON document consumed by the
// endpoint configured in src-tauri/tauri.conf.json.
//
// No dependencies, Node 24+.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_DOWNLOAD_BASE = "https://github.com";

/**
 * Every signed Linux release ships an AppImage plus deb/rpm packages. Tauri
 * looks for `{os}-{arch}-{bundle_type}` first, so deb/rpm clients need their own
 * entries or they would download AppImage bytes and fail to install.
 */
export const DEFAULT_REQUIRED_PLATFORMS = [
  "windows-x86_64",
  "darwin-aarch64",
  "darwin-x86_64",
  "linux-x86_64",
  "linux-x86_64-deb",
  "linux-x86_64-rpm",
];

const USAGE = `Usage:
  node scripts/build-latest-json.mjs --dir <release-dir> --tag <tag> --version <version> \\
    --repo <owner/repo> [--notes <text>] [--out <file>]

Required:
  --dir       Directory scanned recursively for Tauri updater *.sig files.
  --tag       GitHub release tag, for example v0.3.0.
  --version   App version written to latest.json, for example 0.3.0.
  --repo      GitHub repository in owner/name form.

Optional:
  --notes     Release notes embedded in latest.json (default: empty).
  --require   Comma-separated exact platform keys (default: the six desktop keys).
  --out       Output path (default: <dir>/latest.json).
  -h, --help  Show this help.

Supported updater artifacts:
  Windows  *-setup.exe           (_x64/_x86_64/_amd64 -> windows-x86_64,
                                  _arm64/_aarch64       -> windows-aarch64)
  macOS    *.app.tar.gz          (aarch64/arm64 -> darwin-aarch64,
                                  x64/x86_64    -> darwin-x86_64)
  Linux    *.AppImage            (amd64/x86_64 -> linux-x86_64,
                                  aarch64/arm64 -> linux-aarch64)

The signature is read verbatim from the .sig file (trimmed) and the artifact
URL points at https://github.com/<repo>/releases/download/<tag>/<encoded-name>.
`;

function lower(value) {
  return value.toLowerCase();
}

function hasAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

/**
 * GitHub replaces spaces with dots in uploaded release asset names. The
 * manifest URL must use the stored name, not the local filename.
 *
 * @param {string} filename
 * @returns {string}
 */
export function githubAssetName(filename) {
  return path.basename(filename).replaceAll(" ", ".");
}

/**
 * Map an updater artifact filename to a Tauri updater platform key.
 * Returns null for files that are not supported updater artifacts.
 *
 * @param {string} filename
 * @returns {string | null}
 */
export function platformForArtifact(filename) {
  const name = path.basename(filename);
  const lowerName = lower(name);

  // NSIS installers: "LV24 Brain_0.3.0_x64-setup.exe".
  if (lowerName.endsWith("-setup.exe")) {
    if (hasAny(lowerName, ["aarch64", "arm64"])) return "windows-aarch64";
    if (hasAny(lowerName, ["x86_64", "x64", "amd64"])) return "windows-x86_64";
    return null;
  }

  // macOS updater archives: "LV24 Brain_0.3.0_aarch64.app.tar.gz".
  if (lowerName.endsWith(".app.tar.gz")) {
    if (hasAny(lowerName, ["aarch64", "arm64"])) return "darwin-aarch64";
    if (hasAny(lowerName, ["x86_64", "x64"])) return "darwin-x86_64";
    return null;
  }

  // Linux packages: "LV24 Brain_0.3.0_amd64.AppImage", `.deb`, `.rpm`.
  // Tauri checks the bundle-specific key before the generic OS-arch fallback.
  if (lowerName.endsWith(".deb")) {
    if (hasAny(lowerName, ["aarch64", "arm64"])) return "linux-aarch64-deb";
    if (hasAny(lowerName, ["x86_64", "amd64"])) return "linux-x86_64-deb";
    return null;
  }
  if (lowerName.endsWith(".rpm")) {
    if (hasAny(lowerName, ["aarch64", "arm64"])) return "linux-aarch64-rpm";
    if (hasAny(lowerName, ["x86_64", "amd64"])) return "linux-x86_64-rpm";
    return null;
  }
  if (lowerName.endsWith(".appimage")) {
    if (hasAny(lowerName, ["aarch64", "arm64"])) return "linux-aarch64";
    if (hasAny(lowerName, ["x86_64", "amd64"])) return "linux-x86_64";
    return null;
  }

  return null;
}

/**
 * Recursively collect *.sig files, sorted for deterministic output.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function findSignatureFiles(root) {
  const found = [];

  const walk = (dir) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.sig$/i.test(entry.name)) {
        found.push(fullPath);
      }
    }
  };

  walk(root);
  return found.sort();
}

/**
 * @param {string[]} argv
 * @returns {{
 *   help: boolean,
 *   dir?: string,
 *   tag?: string,
 *   version?: string,
 *   repo?: string,
 *   notes: string,
 *   out?: string,
 * }}
 */
export function parseArgs(argv) {
  const options = { help: false, notes: "" };
  const valueOptions = new Set(["dir", "tag", "version", "repo", "notes", "out", "require"]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "-h" || argument === "--help") {
      options.help = true;
      continue;
    }

    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }

    const equalsIndex = argument.indexOf("=");
    let key;
    let value;

    if (equalsIndex !== -1) {
      key = argument.slice(2, equalsIndex);
      value = argument.slice(equalsIndex + 1);
    } else {
      key = argument.slice(2);
      value = argv[index + 1];
      index += 1;
    }

    if (!valueOptions.has(key)) {
      throw new Error(`unknown option: --${key}`);
    }
    if (value === undefined) {
      throw new Error(`missing value for --${key}`);
    }

    options[key] = value;
  }

  return options;
}

/**
 * Build the latest.json document. Throws on invalid or ambiguous input.
 *
 * @param {{
 *   dir: string,
 *   tag: string,
 *   version: string,
 *   repo: string,
 *   notes?: string,
 *   requiredPlatforms?: string[],
 * }} input
 * @returns {{version: string, notes: string, pub_date: string, platforms: Record<string, {signature: string, url: string}>}}
 */
export function buildLatestJson({
  dir,
  tag,
  version,
  repo,
  notes = "",
  requiredPlatforms = DEFAULT_REQUIRED_PLATFORMS,
}) {
  if (!existsSync(dir)) {
    throw new Error(`directory does not exist: ${dir}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error(`--repo must be in owner/name form, got: ${repo}`);
  }
  if (!/^v\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error(`--tag must be a valid release tag such as v0.3.0, got: ${tag}`);
  }
  if (version.trim() === "") {
    throw new Error("--version must not be empty");
  }

  const signatureFiles = findSignatureFiles(dir);
  if (signatureFiles.length === 0) {
    throw new Error(`no *.sig files found under ${dir}`);
  }

  /** @type {Record<string, {signature: string, url: string}>} */
  const platforms = {};
  /** @type {Map<string, string>} */
  const platformSources = new Map();
  const skipped = [];

  for (const signaturePath of signatureFiles) {
    const signatureName = path.basename(signaturePath);
    const artifactName = signatureName.replace(/\.sig$/i, "");
    const platform = platformForArtifact(artifactName);

    if (platform === null) {
      skipped.push(signaturePath);
      continue;
    }

    if (platformSources.has(platform)) {
      throw new Error(
        `duplicate platform ${platform}: ${platformSources.get(platform)} and ${signaturePath}`,
      );
    }

    const artifactPath = path.join(path.dirname(signaturePath), artifactName);
    if (!existsSync(artifactPath)) {
      throw new Error(`signature has no matching artifact: ${signaturePath}`);
    }

    const signature = readFileSync(signaturePath, "utf8").trim();
    if (signature.length === 0) {
      throw new Error(`empty signature file: ${signaturePath}`);
    }

    platforms[platform] = {
      signature,
      url: `${GITHUB_DOWNLOAD_BASE}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(githubAssetName(artifactName))}`,
    };
    platformSources.set(platform, signaturePath);
  }

  for (const skippedPath of skipped) {
    console.warn(`warning: skipping unsupported updater signature: ${skippedPath}`);
  }

  if (requiredPlatforms.length > 0) {
    const missing = requiredPlatforms.filter((platform) => !platforms[platform]);
    const extra = Object.keys(platforms).filter(
      (platform) => !requiredPlatforms.includes(platform),
    );
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `platform set mismatch: missing [${missing.join(", ")}], unexpected [${extra.join(", ")}]; ` +
          `expected [${requiredPlatforms.join(", ")}]`,
      );
    }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error(
      `no supported updater artifacts found under ${dir}; supported names are *-setup.exe, *.app.tar.gz and *.AppImage`,
    );
  }

  // Stable key order keeps diffs and release checks predictable.
  const sortedPlatforms = {};
  for (const platform of Object.keys(platforms).sort()) {
    sortedPlatforms[platform] = platforms[platform];
  }

  return {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: sortedPlatforms,
  };
}

export function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  for (const required of ["dir", "tag", "version", "repo"]) {
    if (!options[required]) {
      console.error(`error: --${required} is required\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
  }

  const outputPath = options.out ?? path.join(options.dir, "latest.json");

  try {
    const latestJson = buildLatestJson({
      dir: options.dir,
      tag: options.tag,
      version: options.version,
      repo: options.repo,
      notes: options.notes,
      requiredPlatforms:
        options.require === undefined
          ? DEFAULT_REQUIRED_PLATFORMS
          : options.require
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
    });

    mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(latestJson, null, 2)}\n`, "utf8");

    console.log(`Wrote ${outputPath}`);
    for (const [platform, entry] of Object.entries(latestJson.platforms)) {
      console.log(`  ${platform}: ${entry.url}`);
    }
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
