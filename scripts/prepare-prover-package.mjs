import { chmod, copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "packages/web-prover/dist");
const manifest = JSON.parse(await readFile(join(root, "dist/runtime/manifest.json"), "utf8"));
for (const path of [
  "dist/runtime/manifest.json",
  ...manifest.files.map(({ path }) => `dist/runtime/${path}`),
  "scripts/setup-assets.mjs",
  "zopro-keys.lock",
  "fixtures/transfer-2x2.json",
  "LICENSE",
]) {
  const destination = join(output, path);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, path), destination);
}
// The package's bin; npm marks it executable on install, but not in a workspace.
await chmod(join(output, "scripts/setup-assets.mjs"), 0o755);
