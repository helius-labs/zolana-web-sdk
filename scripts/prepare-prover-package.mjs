import { copyFile, cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "packages/web-prover/dist");
await cp(join(root, "dist/bridge"), join(output, "dist/bridge"), { recursive: true });
for (const path of [
  "scripts/setup-assets.mjs",
  "runtime.lock.json",
  "wasm/prover/provingkeys/proving-keys.lock",
  "LICENSE",
]) {
  const destination = join(output, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, path), destination);
}
