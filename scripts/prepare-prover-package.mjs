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
// The keys command, beside the digests it reads.
for (const name of ["install-keys.mjs", "assets.mjs"]) {
  await mkdir(join(output, "scripts"), { recursive: true });
  await copyFile(join(root, "packages/web-prover/scripts", name), join(output, "scripts", name));
}
await copyFile(join(root, "LICENSE"), join(output, "LICENSE"));
// The package's bin; npm marks it executable on install, but not in a workspace.
await chmod(join(output, "scripts/install-keys.mjs"), 0o755);
