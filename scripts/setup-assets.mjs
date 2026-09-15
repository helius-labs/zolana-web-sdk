import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtimeLock = JSON.parse(await readFile(join(root, "runtime.lock.json"), "utf8"));
const provingKeysLock = JSON.parse(
  await readFile(join(root, "wasm/prover/provingkeys/proving-keys.lock"), "utf8"),
);

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
  const destination = checkedDestination(entry.destination);
  if (await existingFileMatches(destination, entry)) {
    console.log(`Using ${entry.destination}`);
    continue;
  }
  const bytes = await loadAsset(runtimeBaseUrl, entry.asset);
  verifyBytes(entry.asset, bytes, entry);
  await writeAtomically(destination, bytes);
  console.log(`Installed ${entry.destination}`);
}

const keyManifest = {};
for (const name of runtimeLock.requiredKeys) {
  if (!/^[a-z0-9_-]+\.key$/.test(name)) throw new Error(`Invalid proving-key name: ${name}`);
  const entry = provingKeysLock.keys[name];
  if (!entry) throw new Error(`${name} is missing from the proving-key lockfile`);
  const destination = join(root, "examples/browser/public/keys", name);
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
  join(root, "examples/browser/public/keys/manifest.json"),
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
