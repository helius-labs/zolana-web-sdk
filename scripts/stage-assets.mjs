import { createHash } from "node:crypto";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [bindings, keysDirectory, samplePath] = process.argv.slice(2);
if (!bindings || !keysDirectory || !samplePath) {
  throw new Error("Usage: npm run stage:assets -- <MoproWasmBindings> <keys-directory> <transfer-2x3.json>");
}

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(root, "examples/browser/public");
const accelerator = join(resolve(bindings), "gnark/accelerator");
for (const file of ["gnark_kernel.js", "gnark_kernel_bg.wasm", "LICENSE-APACHE", "LICENSE-MIT"]) {
  if (!(await stat(join(accelerator, file))).isFile()) throw new Error(`Missing Mopro artifact: ${file}`);
}

const sample = await readFile(resolve(samplePath), "utf8");
const request = JSON.parse(sample);
if (request.circuitType !== "transfer-confidential" || request.nInputs !== 2 || request.nOutputs !== 3) {
  throw new Error("Expected a transfer-confidential 2x3 request fixture");
}

const lock = JSON.parse(await readFile(join(root, "wasm/prover/provingkeys/proving-keys.lock"), "utf8"));
const manifest = {};
const available = [];
for (const [name, entry] of Object.entries(lock.keys)) {
  if (!/^(transfer_confidential_\d+_\d+|merge_8_1)\.key$/.test(name)) continue;
  manifest[name] = { size: entry.size, sha256: entry.sha256 };
  const source = join(resolve(keysDirectory), name);
  let bytes;
  try { bytes = await readFile(source); } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== entry.size || digest !== entry.sha256) throw new Error(`${name} does not match the pinned lockfile`);
  available.push({ name, source });
}
if (!available.some(({ name }) => name === "transfer_confidential_2_3.key")) {
  throw new Error("transfer_confidential_2_3.key is required");
}

await mkdir(join(publicDirectory, "prover"), { recursive: true });
await mkdir(join(publicDirectory, "keys"), { recursive: true });
await mkdir(join(publicDirectory, "fixtures"), { recursive: true });
await cp(accelerator, join(publicDirectory, "prover/accelerator"), { recursive: true });
for (const { source, name } of available) await cp(source, join(publicDirectory, "keys", name));
await writeFile(join(publicDirectory, "keys/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(publicDirectory, "fixtures/transfer-2x3.json"), sample);
console.log(`Staged Mopro, ${available.length} proving key(s), and the request fixture.`);
