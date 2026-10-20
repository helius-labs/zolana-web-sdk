// Puts the pinned accelerator release in the package's runtime directory, beside the
// Go bridge build-wasm.sh writes there; every file is checked against runtime.lock.json.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = join(root, "packages/web-prover/src/runtime");
const directory = join(runtime, "accelerator");
const lock = JSON.parse(await readFile(join(root, "runtime.lock.json"), "utf8"));
if (lock.format !== 1 || !/^\d+\.\d+\.\d+$/.test(lock.version)) {
  throw new Error("runtime.lock.json has an unsupported format or version");
}
// A file: URL to a locally built release, for working on the accelerator offline.
const baseUrl = process.env.ZOLANA_RUNTIME_BASE_URL || lock.baseUrl;
// The manifest is kept beside the runtime, and ships with it, so a rebuild needs no network.
const kept = join(runtime, lock.manifest.asset);
let manifestBytes = await readFile(kept).catch(() => undefined);
if (manifestBytes === undefined || !matches(manifestBytes, lock.manifest)) {
  manifestBytes = await load(lock.manifest.asset);
  verify(lock.manifest.asset, manifestBytes, lock.manifest);
  await mkdir(runtime, { recursive: true });
  await writeFile(kept, manifestBytes);
}
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (manifest.format !== 1 || manifest.version !== lock.version || !Array.isArray(manifest.files)) {
  throw new Error("The runtime manifest does not match runtime.lock.json");
}
const files = manifest.files.map((entry) => {
  const path = entry.destination;
  if (typeof path !== "string" || !path.startsWith("accelerator/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`Unsafe runtime destination: ${path}`);
  }
  return { ...entry, path: path.slice("accelerator/".length) };
});

if (await current()) {
  console.log(`Using runtime ${lock.version}`);
} else {
  await rm(directory, { recursive: true, force: true });
  for (const file of files) {
    const bytes = await load(file.asset);
    verify(file.asset, bytes, file);
    await mkdir(dirname(join(directory, file.path)), { recursive: true });
    await writeFile(join(directory, file.path), bytes);
  }
  console.log(`Installed runtime ${lock.version} in ${relative(process.cwd(), directory) || "."}`);
}

/** Whether the directory holds exactly the manifest's files, intact. */
async function current() {
  const present = await walk(directory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  if (present.length !== files.length) return false;
  for (const file of files) {
    const bytes = await readFile(join(directory, file.path)).catch(() => undefined);
    if (bytes === undefined || !matches(bytes, file)) return false;
  }
  return true;
}

async function walk(path) {
  const found = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await walk(join(path, entry.name))));
    else found.push(join(path, entry.name));
  }
  return found;
}

async function load(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Unsafe release asset name: ${name}`);
  }
  const url = new URL(encodeURIComponent(name), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (url.protocol === "file:") return readFile(fileURLToPath(url));
  if (url.protocol !== "https:") throw new Error(`Unsupported runtime URL protocol: ${url.protocol}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Cannot download ${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function matches(bytes, expected) {
  return bytes.length === expected.size && sha256(bytes) === expected.sha256;
}

function verify(name, bytes, expected) {
  if (!Number.isSafeInteger(expected.size) || bytes.length !== expected.size) {
    throw new Error(`${name} has size ${bytes.length}; expected ${expected.size}`);
  }
  if (!/^[a-f0-9]{64}$/.test(expected.sha256) || sha256(bytes) !== expected.sha256) {
    throw new Error(`${name} failed SHA-256 verification`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
