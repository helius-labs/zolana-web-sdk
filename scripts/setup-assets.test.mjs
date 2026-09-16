import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

function digest(bytes) {
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function fixture(context, destination = "examples/browser/public/prover/test.wasm") {
  const root = await mkdtemp(join(tmpdir(), "zolana-assets-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["scripts", "release", "wasm/prover/provingkeys", "dist/bridge"])
    await mkdir(join(root, path), { recursive: true });
  await copyFile(
    new URL("./setup-assets.mjs", import.meta.url),
    join(root, "scripts/setup-assets.mjs"),
  );
  const bytes = Buffer.from("synthetic runtime asset");
  const manifest = Buffer.from(
    JSON.stringify({
      format: 1,
      version: "0.1.0",
      files: [
        { asset: "runtime.wasm", destination, ...digest(bytes) },
        {
          asset: "shim.js",
          destination: "packages/web-prover/src/vendor/wasm_exec.js",
          ...digest(bytes),
        },
        {
          asset: "old-go.wasm",
          destination: "examples/browser/public/prover/zolana-prover.wasm",
          ...digest(bytes),
        },
      ],
    }),
  );
  await writeFile(join(root, "release/runtime.wasm"), bytes);
  await writeFile(join(root, "release/manifest.json"), manifest);
  await writeFile(join(root, "release/transfer_confidential_2_3.key"), bytes);
  await writeFile(join(root, "release/transfer_confidential_1_2.key"), bytes);
  await writeFile(join(root, "release/merge_8_1.key"), bytes);
  const bridgeFiles = [];
  for (const [asset, destination] of [
    ["zolana-prover.wasm", "examples/browser/public/prover/zolana-prover.wasm"],
    ["wasm_exec.js", "packages/web-prover/src/vendor/wasm_exec.js"],
  ]) {
    await writeFile(join(root, "dist/bridge", asset), Buffer.from("rebuilt sanitized bridge"));
    bridgeFiles.push({ asset, destination, ...digest(Buffer.from("rebuilt sanitized bridge")) });
  }
  await writeFile(
    join(root, "dist/bridge/manifest.json"),
    JSON.stringify({ format: 1, files: bridgeFiles }),
  );
  const baseUrl = pathToFileURL(`${join(root, "release")}/`).href;
  await writeFile(
    join(root, "runtime.lock.json"),
    JSON.stringify({
      format: 1,
      version: "0.1.0",
      baseUrl,
      provingKeysBaseUrl: baseUrl,
      manifest: { asset: "manifest.json", ...digest(manifest) },
      requiredKeys: ["transfer_confidential_2_3.key"],
    }),
  );
  await writeFile(
    join(root, "wasm/prover/provingkeys/proving-keys.lock"),
    JSON.stringify({
      keys: {
        "transfer_confidential_2_3.key": digest(bytes),
        "transfer_confidential_1_2.key": digest(bytes),
        "merge_8_1.key": digest(bytes),
        "batch_address-append_40_10.key": digest(bytes),
      },
    }),
  );
  const output = join(root, "consumer/public");
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [join(root, "scripts/setup-assets.mjs"), "--output", output, ...args],
      {
        encoding: "utf8",
        env: { ...process.env, ZOLANA_RUNTIME_BASE_URL: baseUrl, ZOLANA_KEYS_BASE_URL: baseUrl },
      },
    );
  return { root, output, bytes, run };
}

test("standalone setup uses pinned local assets without requiring the source tree or runtime shim", async (context) => {
  const { root, output, bytes, run } = await fixture(context);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(join(output, "prover/test.wasm")), bytes);
  assert.equal(
    await readFile(join(output, "prover/zolana-prover.wasm"), "utf8"),
    "rebuilt sanitized bridge",
  );
  assert.deepEqual(JSON.parse(await readFile(join(output, "keys/manifest.json"), "utf8")), {
    "transfer_confidential_2_3.key": digest(bytes),
  });
  await assert.rejects(readFile(join(root, "packages/web-prover/src/vendor/wasm_exec.js")), {
    code: "ENOENT",
  });
  assert.equal(run().status, 0);
});

test("standalone setup refuses corrupt runtime assets", async (context) => {
  const { root, output, bytes, run } = await fixture(context);
  await writeFile(join(root, "release/runtime.wasm"), Buffer.alloc(bytes.length));
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 verification/);
  await assert.rejects(readFile(join(output, "prover/test.wasm")), { code: "ENOENT" });
});

test("standalone setup rejects manifest traversal", async (context) => {
  const { run } = await fixture(context, "examples/browser/public/prover/../../escape.wasm");
  assert.match(run().stderr, /Unsafe runtime destination/);
});

test("standalone setup refuses a corrupt release manifest", async (context) => {
  const { root, run } = await fixture(context);
  await writeFile(join(root, "release/manifest.json"), "{}");
  assert.notEqual(run().status, 0);
});

test("standalone setup refuses corrupt bundled Go bytes instead of restoring the old release", async (context) => {
  const { root, run } = await fixture(context);
  await writeFile(join(root, "dist/bridge/zolana-prover.wasm"), "corrupt");
  assert.notEqual(run().status, 0);
});

test("explicit keys replace the demo default and emit only the selected locked digests", async (context) => {
  const { output, bytes, run } = await fixture(context);
  const result = run("--keys", "transfer_confidential_1_2.key,merge_8_1.key");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(await readFile(join(output, "keys/manifest.json"), "utf8")), {
    "transfer_confidential_1_2.key": digest(bytes),
    "merge_8_1.key": digest(bytes),
  });
  assert.deepEqual(await readFile(join(output, "keys/transfer_confidential_1_2.key")), bytes);
  await assert.rejects(readFile(join(output, "keys/transfer_confidential_2_3.key")), {
    code: "ENOENT",
  });
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
  await assert.rejects(readFile(join(output, "prover/zolana-prover.wasm")), { code: "ENOENT" });
});

test("explicit key selection still rejects corrupt key bytes", async (context) => {
  const { root, run } = await fixture(context);
  await writeFile(join(root, "release/transfer_confidential_1_2.key"), "corrupt");
  assert.notEqual(run("--keys", "transfer_confidential_1_2.key").status, 0);
});
