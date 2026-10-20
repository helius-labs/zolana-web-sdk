// Puts the pinned accelerator release in the package's runtime directory, beside the
// Go bridge build-wasm.sh writes there; every file is checked against runtime.lock.json.
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { existingFileMatches, loadAsset, matchesEntry, verifyBytes, writeAtomically } from "./assets.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const runtime = process.env.ZOLANA_RUNTIME_DIR || join(root, "packages/web-prover/src/runtime");
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
if (manifestBytes === undefined || !matchesEntry(manifestBytes, lock.manifest)) {
  manifestBytes = await loadAsset(baseUrl, lock.manifest.asset);
  verifyBytes(lock.manifest.asset, manifestBytes, lock.manifest);
  await writeAtomically(kept, manifestBytes);
}
const manifest = JSON.parse(manifestBytes.toString("utf8"));
if (
  manifest.format !== 1 ||
  manifest.version !== lock.version ||
  !Array.isArray(manifest.files) ||
  manifest.files.length === 0
) {
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
    const bytes = await loadAsset(baseUrl, file.asset);
    verifyBytes(file.asset, bytes, file);
    await writeAtomically(join(directory, file.path), bytes);
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
    if (!(await existingFileMatches(join(directory, file.path), file))) return false;
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
