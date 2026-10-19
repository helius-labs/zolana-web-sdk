#!/usr/bin/env node
// Installs the prover runtime the package bundles (dist/runtime, each file
// checked against its manifest) under <public>/prover, the sample requests
// under <public>/fixtures, and the selected zopro keys under <public>/keys,
// each downloaded key checked against zopro-keys.lock.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
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
      "Usage: zolana-prover-assets --output <public-directory> [--keys name1.key,name2.key | --keys none]",
    );
  }
  argumentsMap.set(flag, value);
}
const publicDirectory = argumentsMap.has("--output")
  ? resolve(argumentsMap.get("--output"))
  : join(root, "examples/browser/public");
const keysLock = JSON.parse(await readFile(join(root, "zopro-keys.lock"), "utf8"));
// `none` installs the runtime only, for an app that loads keys from the key CDN.
const keysArgument = argumentsMap.get("--keys");
const selectedKeys =
  keysArgument === "none"
    ? []
    : keysArgument === undefined
      ? ["transfer_confidential_2_2.key"]
      : keysArgument.split(",");
if (
  (selectedKeys.length === 0 && keysArgument !== "none") ||
  new Set(selectedKeys).size !== selectedKeys.length
) {
  throw new Error("Select a nonempty list of distinct proving-key names, or none");
}
for (const name of selectedKeys) {
  if (
    typeof name !== "string" ||
    !/^(transfer_confidential_\d+_\d+|merge_\d+_1)\.key$/.test(name) ||
    !Object.hasOwn(keysLock.keys, name) ||
    !/^[a-z0-9_]+\.zopro$/.test(keysLock.keys[name].file)
  ) {
    throw new Error("Unsupported proving-key name; select a browser key from the pinned zopro-keys.lock");
  }
}

const runtimeDirectory = join(root, "dist/runtime");
let manifest;
try {
  manifest = JSON.parse(await readFile(join(runtimeDirectory, "manifest.json"), "utf8"));
} catch {
  throw new Error("The prover runtime is missing; run npm run build:prover");
}
if (manifest.format !== 2 || !Array.isArray(manifest.files) || manifest.files.length === 0)
  throw new Error("Invalid prover runtime manifest");
const runtime = [];
for (const entry of manifest.files) {
  const destination = checkedDestination(join(publicDirectory, "prover"), entry.path);
  const bytes = await readFile(join(runtimeDirectory, entry.path));
  verifyBytes(entry.path, bytes, entry);
  runtime.push({ destination, entry, bytes });
}
if (!runtime.some(({ entry }) => entry.path === "zopro_prover.js"))
  throw new Error("Invalid prover runtime manifest");

const shown = (path) => relative(process.cwd(), path) || ".";
for (const { destination, entry, bytes } of runtime) {
  if (!(await existingFileMatches(destination, entry))) await writeAtomically(destination, bytes);
}
console.log(`Installed prover runtime from zopro ${manifest.zoproRevision} in ${shown(join(publicDirectory, "prover"))}`);

// Sample requests: every fixture of the source tree, the 2x2 one in the package.
for (const name of await readdir(join(root, "fixtures"))) {
  if (!/^[a-z0-9-]+\.json$/.test(name)) continue;
  const destination = join(publicDirectory, "fixtures", name);
  const bytes = await readFile(join(root, "fixtures", name));
  await writeAtomically(destination, bytes);
}

const keysBaseUrl = process.env.ZOLANA_KEYS_BASE_URL || keysLock.baseUrl;
for (const name of selectedKeys) {
  const entry = keysLock.keys[name];
  const destination = join(publicDirectory, "keys", entry.file);
  if (!(await existingFileMatches(destination, entry))) {
    const bytes = await loadAsset(keysBaseUrl, entry.file);
    verifyBytes(entry.file, bytes, entry);
    await writeAtomically(destination, bytes);
    console.log(`Installed ${shown(destination)}`);
  } else {
    console.log(`Using ${shown(destination)}`);
  }
}

console.log("Ready to prove.");

function checkedDestination(directory, path) {
  if (
    typeof path !== "string" ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`Unsafe runtime path: ${path}`);
  }
  const destination = resolve(directory, path);
  if (!destination.startsWith(`${directory}${sep}`)) throw new Error(`Unsafe runtime path: ${path}`);
  return destination;
}

async function loadAsset(baseUrl, name) {
  const url = new URL(encodeURIComponent(name), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol === "file:") return readFile(fileURLToPath(url));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported asset URL protocol: ${url.protocol}`);
  }
  console.log(`Downloading ${name}...`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Cannot download ${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
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
