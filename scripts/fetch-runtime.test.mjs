import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

function digest(bytes) {
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

/** A repository root with a lock, a local release and a runtime directory of its own. */
async function fixture(context, files) {
  const root = await mkdtemp(join(tmpdir(), "zolana-runtime-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "release"), { recursive: true });
  await copyFile(new URL("./fetch-runtime.mjs", import.meta.url), join(root, "scripts/fetch-runtime.mjs"));
  await mkdir(join(root, "packages/web-prover/scripts"), { recursive: true });
  await copyFile(
    new URL("../packages/web-prover/scripts/assets.mjs", import.meta.url),
    join(root, "packages/web-prover/scripts/assets.mjs"),
  );
  const entries = [];
  for (const [destination, text] of Object.entries(files)) {
    const bytes = Buffer.from(text);
    const asset = destination.replaceAll("/", "--");
    await writeFile(join(root, "release", asset), bytes);
    entries.push({ asset, destination, ...digest(bytes) });
  }
  const manifest = Buffer.from(JSON.stringify({ format: 1, version: "0.9.9", files: entries }));
  await writeFile(join(root, "release/runtime-manifest.json"), manifest);
  const baseUrl = pathToFileURL(`${join(root, "release")}/`).href;
  await writeFile(
    join(root, "runtime.lock.json"),
    JSON.stringify({
      format: 1,
      version: "0.9.9",
      baseUrl,
      manifest: { asset: "runtime-manifest.json", ...digest(manifest) },
    }),
  );
  const runtime = join(root, "runtime");
  const run = (env = {}) =>
    spawnSync(process.execPath, [join(root, "scripts/fetch-runtime.mjs")], {
      encoding: "utf8",
      env: { ...process.env, ZOLANA_RUNTIME_DIR: runtime, ZOLANA_RUNTIME_BASE_URL: "", ...env },
    });
  return { root, runtime, run };
}

const accelerator = {
  "accelerator/gnark_kernel.js": "kernel",
  "accelerator/gnark_kernel_bg.wasm": "wasm bytes",
  "accelerator/snippets/rayon/src/workerHelpers.js": "helpers",
};

test("installs the pinned release, then reuses it without the release", async (context) => {
  const { root, runtime, run } = await fixture(context, accelerator);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Installed runtime 0\.9\.9/);
  assert.equal(await readFile(join(runtime, "accelerator/snippets/rayon/src/workerHelpers.js"), "utf8"), "helpers");
  assert.deepEqual(
    await readFile(join(runtime, "runtime-manifest.json")),
    await readFile(join(root, "release/runtime-manifest.json")),
  );
  await rm(join(root, "release"), { recursive: true });
  const second = run();
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Using runtime 0\.9\.9/);
});

test("replaces a damaged or extra file from the release", async (context) => {
  const { runtime, run } = await fixture(context, accelerator);
  assert.equal(run().status, 0);
  await writeFile(join(runtime, "accelerator/gnark_kernel_bg.wasm"), "damaged");
  await writeFile(join(runtime, "accelerator/stale.js"), "from another release");
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed runtime/);
  assert.equal(await readFile(join(runtime, "accelerator/gnark_kernel_bg.wasm"), "utf8"), "wasm bytes");
  assert.deepEqual((await readdir(join(runtime, "accelerator"))).sort(), ["gnark_kernel.js", "gnark_kernel_bg.wasm", "snippets"]);
});

test("refuses a release file that does not match its manifest, and a manifest that does not match the lock", async (context) => {
  const { root, runtime, run } = await fixture(context, accelerator);
  await writeFile(join(root, "release/accelerator--gnark_kernel.js"), "tampered");
  const file = run();
  assert.notEqual(file.status, 0);
  assert.match(file.stderr, /gnark_kernel\.js has size/);
  await assert.rejects(readFile(join(runtime, "accelerator/gnark_kernel.js")), { code: "ENOENT" });
  // The kept copy of the manifest would otherwise stand in for the release's.
  await rm(join(runtime, "runtime-manifest.json"), { force: true });
  await writeFile(join(root, "release/runtime-manifest.json"), "{}");
  const manifest = run();
  assert.notEqual(manifest.status, 0);
  assert.match(manifest.stderr, /runtime-manifest\.json has size/);
});

test("refuses a manifest with no files or a destination outside the accelerator", async (context) => {
  const empty = await fixture(context, {});
  const none = empty.run();
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /does not match runtime\.lock\.json/);
  const outside = await fixture(context, { "accelerator/../escape.js": "escape" });
  assert.match(outside.run().stderr, /Unsafe runtime destination/);
  const elsewhere = await fixture(context, { "vendor/wasm_exec.js": "shim" });
  assert.match(elsewhere.run().stderr, /Unsafe runtime destination/);
});

test("ZOLANA_RUNTIME_BASE_URL names a mirror of the release", async (context) => {
  const { root, runtime, run } = await fixture(context, accelerator);
  const mirror = join(root, "mirror");
  await mkdir(mirror);
  for (const name of await readdir(join(root, "release")))
    await copyFile(join(root, "release", name), join(mirror, name));
  await rm(join(root, "release"), { recursive: true });
  const result = run({ ZOLANA_RUNTIME_BASE_URL: pathToFileURL(`${mirror}/`).href });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(runtime, "accelerator/gnark_kernel.js"), "utf8"), "kernel");
});
