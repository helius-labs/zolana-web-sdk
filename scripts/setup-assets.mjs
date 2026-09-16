#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const argumentsList = process.argv.slice(2);
const argumentsMap = new Map();
for (let index = 0; index < argumentsList.length; index += 2) {
  const flag = argumentsList[index];
  const value = argumentsList[index + 1];
  if (
    !["--output", "--keys"].includes(flag) ||
    !value ||
    value.startsWith("--") ||
    argumentsMap.has(flag)
  ) {
    throw new Error(
      "Usage: zolana-prover-assets --output <public-directory> [--keys name1.key,name2.key]",
    );
  }
  argumentsMap.set(flag, value);
}
const standalone = argumentsMap.has("--output");
const publicDirectory = standalone
  ? resolve(argumentsMap.get("--output"))
  : join(root, "examples/browser/public");
const runtimeLock = JSON.parse(await readFile(join(root, "runtime.lock.json"), "utf8"));
const provingKeysLock = JSON.parse(
  await readFile(join(root, "wasm/prover/provingkeys/proving-keys.lock"), "utf8"),
);
const selectedKeys = argumentsMap.has("--keys")
  ? argumentsMap.get("--keys").split(",")
  : runtimeLock.requiredKeys;
if (
  !Array.isArray(selectedKeys) ||
  selectedKeys.length === 0 ||
  new Set(selectedKeys).size !== selectedKeys.length
) {
  throw new Error("Select a nonempty list of distinct proving-key names");
}
for (const name of selectedKeys) {
  if (
    typeof name !== "string" ||
    !/^(transfer_confidential_\d+_\d+|merge_8_1)\.key$/.test(name) ||
    !Object.hasOwn(provingKeysLock.keys, name)
  ) {
    throw new Error(
      "Unsupported proving-key name; select a browser key from the pinned proving-keys lockfile",
    );
  }
}
const bridgeDirectory = join(root, "dist/bridge");
const bridgeManifest = JSON.parse(await readFile(join(bridgeDirectory, "manifest.json"), "utf8"));
if (
  bridgeManifest.format !== 1 ||
  !Array.isArray(bridgeManifest.files) ||
  bridgeManifest.files.length !== 2
)
  throw new Error("Rebuilt Go bridge is missing; run npm run build:prover");
const bridgeFiles = new Map();
for (const entry of bridgeManifest.files) {
  if (
    !(
      (entry.asset === "zolana-prover.wasm" &&
        entry.destination === "examples/browser/public/prover/zolana-prover.wasm") ||
      (entry.asset === "wasm_exec.js" &&
        entry.destination === "packages/web-prover/src/vendor/wasm_exec.js")
    )
  ) {
    throw new Error("Invalid rebuilt Go bridge manifest");
  }
  const bytes = await readFile(join(bridgeDirectory, entry.asset));
  verifyBytes(entry.asset, bytes, entry);
  bridgeFiles.set(entry.destination, { entry, bytes });
}
if (bridgeFiles.size !== 2) throw new Error("Incomplete rebuilt Go bridge manifest");

if (runtimeLock.format !== 1 || !/^\d+\.\d+\.\d+$/.test(runtimeLock.version)) {
  throw new Error("runtime.lock.json has an unsupported format or version");
}

const runtimeBaseUrl = process.env.ZOLANA_RUNTIME_BASE_URL || runtimeLock.baseUrl;
const provingKeysBaseUrl = process.env.ZOLANA_KEYS_BASE_URL || runtimeLock.provingKeysBaseUrl;
const manifestBytes = await loadAsset(runtimeBaseUrl, runtimeLock.manifest.asset);
verifyBytes(runtimeLock.manifest.asset, manifestBytes, runtimeLock.manifest);

const runtimeManifest = JSON.parse(manifestBytes.toString("utf8"));
if (runtimeManifest.format !== 1 || runtimeManifest.version !== runtimeLock.version) {
  throw new Error("Runtime manifest does not match runtime.lock.json");
}
if (!Array.isArray(runtimeManifest.files) || runtimeManifest.files.length === 0) {
  throw new Error("Runtime manifest does not contain any files");
}

for (const entry of runtimeManifest.files) {
  if (bridgeFiles.has(entry.destination)) continue;
  const destination = checkedDestination(entry.destination);
  if (destination === undefined) continue;
  if (await existingFileMatches(destination, entry)) {
    console.log(`Using ${entry.destination}`);
    continue;
  }
  const bytes = await loadAsset(runtimeBaseUrl, entry.asset);
  verifyBytes(entry.asset, bytes, entry);
  await writeAtomically(destination, bytes);
  console.log(`Installed ${entry.destination}`);
}

for (const [name, { entry, bytes }] of bridgeFiles) {
  const destination = checkedDestination(name);
  if (destination === undefined) continue;
  if (!(await existingFileMatches(destination, entry))) await writeAtomically(destination, bytes);
  console.log(`Using rebuilt Go bridge: ${name}`);
}

const keyManifest = {};
for (const name of selectedKeys) {
  const entry = provingKeysLock.keys[name];
  const destination = join(publicDirectory, "keys", name);
  if (!(await existingFileMatches(destination, entry))) {
    const bytes = await loadAsset(provingKeysBaseUrl, name);
    verifyBytes(name, bytes, entry);
    await writeAtomically(destination, bytes);
    console.log(`Installed examples/browser/public/keys/${name}`);
  } else {
    console.log(`Using examples/browser/public/keys/${name}`);
  }
  keyManifest[name] = { size: entry.size, sha256: entry.sha256 };
}

await writeAtomically(
  join(publicDirectory, "keys/manifest.json"),
  Buffer.from(`${JSON.stringify(keyManifest, null, 2)}\n`),
);
console.log(`Ready to prove with runtime ${runtimeLock.version}.`);

function checkedDestination(value) {
  if (typeof value !== "string" || value.includes("\\") || value.split("/").includes("..")) {
    throw new Error(`Unsafe runtime destination: ${value}`);
  }
  const allowed = [
    "examples/browser/public/prover/",
    "examples/browser/public/fixtures/",
    "packages/web-prover/src/vendor/",
  ];
  if (!allowed.some((prefix) => value.startsWith(prefix))) {
    throw new Error(`Runtime destination is outside generated asset directories: ${value}`);
  }
  if (standalone) {
    if (value.startsWith("packages/web-prover/src/vendor/")) return undefined;
    return resolve(publicDirectory, value.slice("examples/browser/public/".length));
  }
  const destination = resolve(root, value);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!destination.startsWith(rootPrefix)) throw new Error(`Unsafe runtime destination: ${value}`);
  return destination;
}

async function loadAsset(baseUrl, name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Unsafe release asset name: ${name}`);
  }
  const url = new URL(encodeURIComponent(name), ensureTrailingSlash(baseUrl));
  if (url.protocol === "file:") return readFile(fileURLToPath(url));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported asset URL protocol: ${url.protocol}`);
  }
  console.log(`Downloading ${name}...`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Cannot download ${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function verifyBytes(name, bytes, expected) {
  if (!Number.isSafeInteger(expected.size) || expected.size < 0 || bytes.length !== expected.size) {
    throw new Error(`${name} has size ${bytes.length}; expected ${expected.size}`);
  }
  if (!/^[a-f0-9]{64}$/.test(expected.sha256)) {
    throw new Error(`${name} has an invalid pinned SHA-256`);
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expected.sha256) throw new Error(`${name} failed SHA-256 verification`);
}

async function existingFileMatches(path, expected) {
  try {
    if ((await stat(path)).size !== expected.size) return false;
    const bytes = await readFile(path);
    return createHash("sha256").update(bytes).digest("hex") === expected.sha256;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeAtomically(destination, bytes) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, bytes);
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
