import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

function digest(bytes) {
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

const helper = "snippets/wasm-bindgen-rayon-0/src/workerHelpers.no-bundler.js";

/** A package-shaped directory: the setup script, a runtime, the lock and a release of keys. */
async function fixture(context, runtimePath = "zopro_zolana_bg.wasm") {
  const root = await mkdtemp(join(tmpdir(), "zolana-assets-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["scripts", "release", "fixtures", "dist/runtime"])
    await mkdir(join(root, path), { recursive: true });
  await copyFile(new URL("./setup-assets.mjs", import.meta.url), join(root, "scripts/setup-assets.mjs"));
  const files = [];
  for (const [path, text] of [
    ["zopro_zolana.js", "runtime module"],
    [runtimePath, "runtime wasm"],
    [helper, "thread pool helper"],
  ]) {
    const bytes = Buffer.from(text);
    if (!runtimePath.includes("..") || path !== runtimePath) {
      await mkdir(dirname(join(root, "dist/runtime", path)), { recursive: true });
      await writeFile(join(root, "dist/runtime", path), bytes);
    }
    files.push({ path, ...digest(bytes) });
  }
  await writeFile(
    join(root, "dist/runtime/manifest.json"),
    JSON.stringify({ format: 2, zoproRevision: "0".repeat(40), files }),
  );
  await writeFile(join(root, "fixtures/transfer-2x2.json"), "sample request");
  const bytes = Buffer.from("zopro key");
  const keys = {};
  for (const stem of ["transfer_confidential_2_2", "transfer_confidential_1_2", "merge_8_1", "batch_address-append_40_10"]) {
    await writeFile(join(root, `release/${stem}.zopro`), bytes);
    keys[`${stem}.key`] = { file: `${stem}.zopro`, ...digest(bytes), key_sha256: "ab".repeat(32) };
  }
  const baseUrl = pathToFileURL(`${join(root, "release")}/`).href;
  await writeFile(
    join(root, "zopro-keys.lock"),
    JSON.stringify({ prefix: "proving-keys/0123", baseUrl: "https://keys.invalid/proving-keys/0123/", keys }),
  );
  const output = join(root, "consumer/public");
  const run = (...args) =>
    spawnSync(process.execPath, [join(root, "scripts/setup-assets.mjs"), "--output", output, ...args], {
      encoding: "utf8",
      env: { ...process.env, ZOLANA_KEYS_BASE_URL: baseUrl },
    });
  return { root, output, bytes, run };
}

test("setup installs the bundled runtime, the sample request and the default key", async (context) => {
  const { output, bytes, run } = await fixture(context);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(output, "prover/zopro_zolana.js"), "utf8"), "runtime module");
  assert.equal(await readFile(join(output, "prover/zopro_zolana_bg.wasm"), "utf8"), "runtime wasm");
  assert.equal(await readFile(join(output, `prover/${helper}`), "utf8"), "thread pool helper");
  assert.equal(await readFile(join(output, "fixtures/transfer-2x2.json"), "utf8"), "sample request");
  assert.deepEqual(await readFile(join(output, "keys/transfer_confidential_2_2.zopro")), bytes);
  await assert.rejects(readFile(join(output, "keys/manifest.json")), { code: "ENOENT" });
  assert.equal(run().status, 0);
});

test("setup refuses corrupt runtime files before installing any", async (context) => {
  const { root, output, run } = await fixture(context);
  await writeFile(join(root, "dist/runtime/zopro_zolana_bg.wasm"), "runtime wasN");
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 verification/);
  await assert.rejects(readFile(join(output, "prover/zopro_zolana.js")), { code: "ENOENT" });
});

test("setup rejects a runtime path outside the prover directory", async (context) => {
  const { run } = await fixture(context, "../escape.wasm");
  assert.match(run().stderr, /Unsafe runtime path/);
});

test("setup refuses a missing or malformed runtime manifest", async (context) => {
  const { root, run } = await fixture(context);
  await writeFile(join(root, "dist/runtime/manifest.json"), "{}");
  assert.match(run().stderr, /Invalid prover runtime manifest/);
  await rm(join(root, "dist/runtime/manifest.json"));
  assert.match(run().stderr, /prover runtime is missing/);
});

test("explicit keys replace the demo default and install only the selected locked keys", async (context) => {
  const { output, bytes, run } = await fixture(context);
  const result = run("--keys", "transfer_confidential_1_2.key,merge_8_1.key");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(join(output, "keys/transfer_confidential_1_2.zopro")), bytes);
  assert.deepEqual(await readFile(join(output, "keys/merge_8_1.zopro")), bytes);
  await assert.rejects(readFile(join(output, "keys/transfer_confidential_2_2.zopro")), {
    code: "ENOENT",
  });
});

test("--keys none installs the runtime without any key", async (context) => {
  const { output, run } = await fixture(context);
  const result = run("--keys", "none");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(output, "prover/zopro_zolana.js"), "utf8"), "runtime module");
  await assert.rejects(readFile(join(output, "keys/transfer_confidential_2_2.zopro")), { code: "ENOENT" });
});

test("unsupported, malformed and duplicate key selections fail before installing assets", async (context) => {
  const { output, run } = await fixture(context);
  for (const selection of [
    "transfer_confidential_99_99.key",
    "../transfer_confidential_1_2.key",
    "__proto__",
    "batch_address-append_40_10.key",
    "",
    "transfer_confidential_1_2.key,",
    "transfer_confidential_1_2.key,transfer_confidential_1_2.key",
  ])
    assert.notEqual(run("--keys", selection).status, 0);
  assert.notEqual(run("--keys").status, 0);
  assert.notEqual(run("--keys", "merge_8_1.key", "--keys", "merge_8_1.key").status, 0);
  await assert.rejects(readFile(join(output, "prover/zopro_zolana.js")), { code: "ENOENT" });
});

test("explicit key selection still rejects corrupt key bytes", async (context) => {
  const { root, run } = await fixture(context);
  await writeFile(join(root, "release/transfer_confidential_1_2.zopro"), "corrupt");
  assert.notEqual(run("--keys", "transfer_confidential_1_2.key").status, 0);
});
