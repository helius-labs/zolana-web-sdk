// Fetching and checking pinned files, shared by the runtime fetch at build time
// and the keys command an app runs; both ship with the package.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** The bytes of `name` under `baseUrl`: a `file:` directory, or a host. */
export async function loadAsset(baseUrl, name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+$/.test(name)) {
    throw new Error(`Unsafe asset name: ${name}`);
  }
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

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Whether `bytes` have the pinned size and SHA-256. */
export function matchesEntry(bytes, expected) {
  return (
    Number.isSafeInteger(expected.size) &&
    bytes.length === expected.size &&
    /^[a-f0-9]{64}$/.test(expected.sha256) &&
    sha256(bytes) === expected.sha256
  );
}

export function verifyBytes(name, bytes, expected) {
  if (!Number.isSafeInteger(expected.size) || bytes.length !== expected.size) {
    throw new Error(`${name} has size ${bytes.length}; expected ${expected.size}`);
  }
  if (!/^[a-f0-9]{64}$/.test(expected.sha256)) {
    throw new Error(`${name} has an invalid pinned SHA-256`);
  }
  if (sha256(bytes) !== expected.sha256) throw new Error(`${name} failed SHA-256 verification`);
}

/** Whether the file at `path` exists with the pinned size and SHA-256. */
export async function existingFileMatches(path, expected) {
  try {
    if ((await stat(path)).size !== expected.size) return false;
    return matchesEntry(await readFile(path), expected);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

/** Writes through a temporary file, so an interrupted write leaves no partial file. */
export async function writeAtomically(destination, bytes) {
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
