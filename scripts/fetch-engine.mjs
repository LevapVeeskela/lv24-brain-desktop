#!/usr/bin/env node
// Downloads a prebuilt LV24 Brain engine binary and places it where Tauri
// expects an externalBin sidecar: <out>/brain-<target>[.exe].
//
// The download is verified against the release's checksums.txt before the
// destination file is written. No npm dependencies, Node 24+.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ENGINE_REPO = "LevapVeeskela/lv24-brain";
const DEFAULT_BASE_URL = (version) =>
  `https://github.com/${ENGINE_REPO}/releases/download/v${version}`;
const DEFAULT_OUT_DIR = path.resolve(import.meta.dirname, "..", "src-tauri", "binaries");
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const PINNED_CHECKSUMS_PATH = path.join(import.meta.dirname, "engine-checksums.json");

const TARGET_ASSETS = new Map([
  ["x86_64-pc-windows-msvc", (version) => `brain_${version}_windows_amd64.exe`],
  ["aarch64-pc-windows-msvc", (version) => `brain_${version}_windows_arm64.exe`],
  ["x86_64-apple-darwin", (version) => `brain_${version}_darwin_amd64`],
  ["aarch64-apple-darwin", (version) => `brain_${version}_darwin_arm64`],
  ["x86_64-unknown-linux-gnu", (version) => `brain_${version}_linux_amd64`],
  ["aarch64-unknown-linux-gnu", (version) => `brain_${version}_linux_arm64`],
]);

const USAGE = `Usage: node scripts/fetch-engine.mjs --version <x.y.z> --target <rust-target> [options]

Download a prebuilt LV24 Brain engine and write it as a Tauri externalBin
sidecar named brain-<target>[.exe].

Required:
  --version <x.y.z>    Engine release version (a leading "v" is accepted).
  --target <triple>    Rust target triple to fetch:
                         x86_64-pc-windows-msvc
                         aarch64-pc-windows-msvc
                         x86_64-apple-darwin
                         aarch64-apple-darwin
                         x86_64-unknown-linux-gnu
                         aarch64-unknown-linux-gnu

Options:
  --out <dir>          Output directory (default: src-tauri/binaries next to
                       this script's repository root).
  --base-url <url>     Release asset base URL (default: the lv24-brain GitHub
                       release for --version).
  -h, --help           Show this help.

The asset is verified against checksums.txt from the same release and against
the reviewed pin in scripts/engine-checksums.json before it is written
atomically. Exit codes: 0 success, 1 download or verification failure,
2 invalid arguments.`;

class UsageError extends Error {}

function fail(message) {
  throw new Error(message);
}

function failUsage(message) {
  throw new UsageError(message);
}

function parseArgs(argv) {
  const options = {
    version: undefined,
    target: undefined,
    out: undefined,
    baseUrl: undefined,
    help: false,
  };

  const valueFlags = new Map([
    ["--version", "version"],
    ["--target", "target"],
    ["--out", "out"],
    ["--base-url", "baseUrl"],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
    const key = valueFlags.get(flag);

    if (!key) {
      failUsage(`Unknown argument: ${argument}\n\n${USAGE}`);
    }

    let value = inlineValue;
    if (value === undefined) {
      index += 1;
      value = argv[index];
    }

    if (value === undefined || value === "" || (inlineValue === undefined && value.startsWith("--"))) {
      failUsage(`Missing value for ${flag}\n\n${USAGE}`);
    }

    options[key] = value;
  }

  return options;
}

function normalizeVersion(rawVersion) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(rawVersion ?? "");
  if (!match) {
    failUsage(`Invalid --version "${rawVersion}". Expected x.y.z (for example 0.12.0).`);
  }
  return match.slice(1).join(".");
}

function normalizeBaseUrl(rawBaseUrl, version) {
  const baseUrl = (rawBaseUrl ?? DEFAULT_BASE_URL(version)).replace(/\/+$/, "");

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    failUsage(`Invalid --base-url "${rawBaseUrl}". Expected an http(s) URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    failUsage(`Invalid --base-url "${rawBaseUrl}". Only http and https URLs are supported.`);
  }
  return baseUrl;
}

async function download(url) {
  let response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { "user-agent": "lv24-brain-desktop-fetch-engine" },
    });
  } catch (error) {
    const reason =
      error?.name === "TimeoutError"
        ? `timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`
        : (error?.cause?.message ?? error?.message ?? String(error));
    fail(`Failed to download ${url}: ${reason}`);
  }

  if (!response.ok) {
    const details = response.statusText ? ` ${response.statusText}` : "";
    fail(`Failed to download ${url}: HTTP ${response.status}${details}`);
  }

  try {
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    fail(`Failed to read response body from ${url}: ${error?.message ?? String(error)}`);
  }
}

function parseChecksums(text, sourceUrl) {
  const checksums = new Map();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    // sha256sum format: "<64 hex chars><whitespace>[ *]<filename>".
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line);
    if (!match) {
      fail(
        `Malformed checksum entry in ${sourceUrl} at line ${index + 1}: "${line}". ` +
          `Expected sha256sum format ("<64 hex chars>  <filename>").`,
      );
    }

    const [, checksum, fileName] = match;
    const normalizedName = fileName.trim();
    const normalizedChecksum = checksum.toLowerCase();
    const existing = checksums.get(normalizedName);

    if (existing !== undefined && existing !== normalizedChecksum) {
      fail(`Conflicting checksum entries for "${normalizedName}" in ${sourceUrl}.`);
    }
    checksums.set(normalizedName, normalizedChecksum);
  }

  if (checksums.size === 0) {
    fail(`No checksum entries found in ${sourceUrl}.`);
  }
  return checksums;
}

function pinnedChecksum(version, assetName) {
  let pins;
  try {
    pins = JSON.parse(readFileSync(PINNED_CHECKSUMS_PATH, "utf8"));
  } catch (error) {
    fail(
      `Cannot read pinned engine checksums at ${PINNED_CHECKSUMS_PATH}: ` +
        `${error?.message ?? String(error)}`,
    );
  }
  const pinned = pins?.[version]?.[assetName];
  if (typeof pinned !== "string" || !/^[0-9a-f]{64}$/i.test(pinned)) {
    fail(
      `No pinned checksum for ${assetName} in engine ${version}. ` +
        `Add it to ${PINNED_CHECKSUMS_PATH} after reviewing the engine release.`,
    );
  }
  return pinned.toLowerCase();
}

function findChecksum(checksums, assetName, sourceUrl) {  const direct = checksums.get(assetName);
  if (direct !== undefined) {
    return direct;
  }

  // Tolerate entries that carry a path prefix (for example "./asset").
  const matches = [...checksums.entries()].filter(
    ([fileName]) => path.basename(fileName.replaceAll("\\", "/")) === assetName,
  );
  if (matches.length === 1) {
    return matches[0][1];
  }
  if (matches.length > 1) {
    fail(`Ambiguous checksum entries for "${assetName}" in ${sourceUrl}.`);
  }

  fail(`No checksum entry for "${assetName}" in ${sourceUrl}.`);
}

async function writeAtomically(destination, contents) {
  await mkdir(path.dirname(destination), { recursive: true });

  const temporaryPath = `${destination}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporaryPath, contents);
    if (process.platform !== "win32") {
      await chmod(temporaryPath, 0o755);
    }
    await rename(temporaryPath, destination);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    fail(
      `Failed to write ${destination}: ${error?.message ?? String(error)}. ` +
        `If the engine is running, stop it and retry.`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  if (options.version === undefined) {
    failUsage(`Missing required --version\n\n${USAGE}`);
  }
  const version = normalizeVersion(options.version);
  if (options.target === undefined) {
    failUsage(`Missing required --target\n\n${USAGE}`);
  }

  const assetNameForVersion = TARGET_ASSETS.get(options.target);
  if (!assetNameForVersion) {
    failUsage(
      `Unsupported --target "${options.target}". Supported targets:\n` +
        [...TARGET_ASSETS.keys()].map((target) => `  ${target}`).join("\n"),
    );
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl, version);
  const assetName = assetNameForVersion(version);
  const checksumsUrl = `${baseUrl}/checksums.txt`;
  const assetUrl = `${baseUrl}/${assetName}`;
  const outDir = options.out === undefined ? DEFAULT_OUT_DIR : path.resolve(options.out);
  const exeSuffix = options.target.includes("windows") ? ".exe" : "";
  const destination = path.join(outDir, `brain-${options.target}${exeSuffix}`);

  console.log(`Downloading ${assetName} from ${assetUrl}`);
  const [asset, checksumsText] = await Promise.all([
    download(assetUrl),
    download(checksumsUrl).then((buffer) => buffer.toString("utf8")),
  ]);

  const checksums = parseChecksums(checksumsText, checksumsUrl);
  const expectedChecksum = findChecksum(checksums, assetName, checksumsUrl);
  const pinned = pinnedChecksum(version, assetName);
  const actualChecksum = createHash("sha256").update(asset).digest("hex");

  if (expectedChecksum !== pinned) {
    fail(
      `Pinned checksum mismatch for ${assetName}:\n` +
        `  pinned:   ${pinned}\n` +
        `  release:  ${expectedChecksum}\n` +
        `The engine release checksums changed; review the release before updating the pin file.`,
    );
  }
  if (actualChecksum !== expectedChecksum) {
    fail(
      `Checksum mismatch for ${assetName}:\n` +
        `  expected: ${expectedChecksum}\n` +
        `  actual:   ${actualChecksum}\n` +
        `The download may be corrupted or the release was republished; retry before using it.`,
    );
  }
  console.log(`Verified sha256 ${actualChecksum}`);

  await writeAtomically(destination, asset);
  console.log(destination);
}

main().catch((error) => {
  console.error(`fetch-engine: ${error?.message ?? String(error)}`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
});
