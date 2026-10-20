#!/usr/bin/env node
// Installs pinned proving keys for an app that serves them itself; each key is
// checked against the size and SHA-256 in the proving-keys lockfile.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const usage = "Usage: zolana-prover-keys --output <directory> --keys name1.key,name2.key";
const root = fileURLToPath(new URL("../", import.meta.url));
const argumentsList = process.argv.slice(2);
const argumentsMap = new Map();
for (let index = 0; index < argumentsList.length; index += 2) {
  const flag = argumentsList[index];
  const value = argumentsList[index + 1];
  if (!["--output", "--keys"].includes(flag) || !value || value.startsWith("--") || argumentsMap.has(flag)) {
    throw new Error(usage);
  }
  argumentsMap.set(flag, value);
}
if (!argumentsMap.has("--output") || !argumentsMap.has("--keys")) throw new Error(usage);
const output = resolve(argumentsMap.get("--output"));
const runtimeLock = JSON.parse(await readFile(join(root, "runtime.lock.json"), "utf8"));
const provingKeysLock = JSON.parse(
  await readFile(join(root, "wasm/prover/provingkeys/proving-keys.lock"), "utf8"),
);
const selectedKeys = argumentsMap.get("--keys").split(",");
if (new Set(selectedKeys).size !== selectedKeys.length) {
  throw new Error("Select a list of distinct proving-key names");
}
for (const name of selectedKeys) {
  if (
    !/^(transfer_confidential_\d+_\d+|merge_\d+_1)\.key$/.test(name) ||
    !Object.hasOwn(provingKeysLock.keys, name)
  ) {
    throw new Error(
      "Unsupported proving-key name; select a browser key from the pinned proving-keys lockfile",
    );
  }
}
// A file: URL to a local mirror of the key set; the same checks apply.
const baseUrl = process.env.ZOLANA_KEYS_BASE_URL || runtimeLock.provingKeysBaseUrl;
const shown = (path) => relative(process.cwd(), path) || ".";

for (const name of selectedKeys) {
  const entry = provingKeysLock.keys[name];
  const destination = join(output, name);
  if (await existingFileMatches(destination, entry)) {
    console.log(`Using ${shown(destination)}`);
    continue;
  }
  const bytes = await loadKey(name);
  verifyBytes(name, bytes, entry);
  await writeAtomically(destination, bytes);
  console.log(`Installed ${shown(destination)}`);
}

async function loadKey(name) {
  const url = new URL(encodeURIComponent(name), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol === "file:") return readFile(fileURLToPath(url));
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported key URL protocol: ${url.protocol}`);
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
