import { chmod, copyFile, cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = join(root, "packages/web-prover/src");
const output = join(root, "packages/web-prover/dist");
// The Go bridge and the accelerator sit beside the compiled worker byte for byte, and so
// does the Go shim, which tsc would otherwise re-emit.
await rm(join(output, "runtime"), { recursive: true, force: true });
await cp(join(source, "runtime"), join(output, "runtime"), { recursive: true });
await copyFile(join(source, "vendor/wasm_exec.js"), join(output, "vendor/wasm_exec.js"));
for (const path of [
  "scripts/install-keys.mjs",
  "runtime.lock.json",
  "wasm/prover/provingkeys/proving-keys.lock",
  "LICENSE",
]) {
  const destination = join(output, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, path), destination);
}
// The package's bin; npm marks it executable on install, but not in a workspace.
await chmod(join(output, "scripts/install-keys.mjs"), 0o755);
