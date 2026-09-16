import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const directory = fileURLToPath(new URL("../dist/bridge/", import.meta.url));
const files = [];
for (const [asset, destination] of [
  ["zolana-prover.wasm", "examples/browser/public/prover/zolana-prover.wasm"],
  ["wasm_exec.js", "packages/web-prover/src/vendor/wasm_exec.js"],
]) {
  const bytes = await readFile(join(directory, asset));
  files.push({
    asset,
    destination,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
await writeFile(
  join(directory, "manifest.json"),
  JSON.stringify({ format: 1, files }, null, 2) + "\n",
);
