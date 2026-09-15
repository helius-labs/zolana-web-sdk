import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

const [version, stagingArgument, outputArgument] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || "") || !stagingArgument || !outputArgument) {
  throw new Error("Usage: node scripts/package-runtime.mjs <version> <staging-directory> <output-directory>");
}

const staging = resolve(stagingArgument);
const output = resolve(outputArgument);
const required = [
  "examples/browser/public/prover/zolana-prover.wasm",
  "examples/browser/public/prover/accelerator/gnark_kernel.js",
  "examples/browser/public/prover/accelerator/gnark_kernel_bg.wasm",
  "examples/browser/public/prover/accelerator/LICENSE-APACHE",
  "examples/browser/public/prover/accelerator/LICENSE-MIT",
  "examples/browser/public/fixtures/transfer-2x3.json",
  "packages/web-prover/src/vendor/wasm_exec.js",
];
for (const path of required) {
  if (!(await stat(join(staging, path))).isFile()) throw new Error(`Missing runtime file: ${path}`);
}

const files = (await walk(staging)).sort();
if (!files.some((path) => path.includes("/snippets/") && basename(path) === "workerHelpers.no-bundler.js")) {
  throw new Error("Mopro accelerator is missing the Rayon worker helper");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const entries = [];
for (const destination of files) {
  const source = join(staging, destination);
  const bytes = await readFile(source);
  const asset = destination.replaceAll("/", "--");
  await cp(source, join(output, asset));
  entries.push({
    asset,
    destination,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const manifest = {
  format: 1,
  version,
  provenance: {
    zolanaRevision: requiredEnvironment("ZOLANA_REVISION"),
    moproRepository: "https://github.com/sergeytimoshin/mopro.git",
    moproRevision: requiredEnvironment("MOPRO_REVISION"),
    go: requiredEnvironment("GO_VERSION"),
    rustToolchain: requiredEnvironment("RUST_TOOLCHAIN"),
    wasmPack: requiredEnvironment("WASM_PACK_VERSION"),
  },
  files: entries,
};
await writeFile(join(output, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Packaged ${entries.length} runtime files in ${output}`);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(path)));
    } else if (entry.isFile()) {
      files.push(relative(staging, path).split("\\").join("/"));
    }
  }
  return files;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
