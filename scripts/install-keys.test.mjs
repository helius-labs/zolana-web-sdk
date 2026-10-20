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

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "zolana-keys-test-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["scripts", "keys", "mirror", "wasm/prover/provingkeys"])
    await mkdir(join(root, path), { recursive: true });
  await copyFile(new URL("./install-keys.mjs", import.meta.url), join(root, "scripts/install-keys.mjs"));
  const bytes = Buffer.from("synthetic proving key");
  for (const name of ["transfer_confidential_2_2.key", "transfer_confidential_1_2.key", "merge_8_1.key"]) {
    await writeFile(join(root, "keys", name), bytes);
    await writeFile(join(root, "mirror", name), bytes);
  }
  const keysUrl = pathToFileURL(`${join(root, "keys")}/`).href;
  await writeFile(join(root, "runtime.lock.json"), JSON.stringify({ provingKeysBaseUrl: keysUrl }));
  await writeFile(
    join(root, "wasm/prover/provingkeys/proving-keys.lock"),
    JSON.stringify({
      keys: {
        "transfer_confidential_2_2.key": digest(bytes),
        "transfer_confidential_1_2.key": digest(bytes),
        "merge_8_1.key": digest(bytes),
        "batch_address-append_40_10.key": digest(bytes),
      },
    }),
  );
  const output = join(root, "app/public/keys");
  const run = (args, env = {}) =>
    spawnSync(process.execPath, [join(root, "scripts/install-keys.mjs"), ...args], {
      encoding: "utf8",
      env: { ...process.env, ZOLANA_KEYS_BASE_URL: "", ...env },
    });
  return { root, output, bytes, run };
}

test("installs only the selected locked keys and reuses intact ones", async (context) => {
  const { output, bytes, run } = await fixture(context);
  const args = ["--output", output, "--keys", "transfer_confidential_1_2.key,merge_8_1.key"];
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(join(output, "transfer_confidential_1_2.key")), bytes);
  assert.deepEqual(await readFile(join(output, "merge_8_1.key")), bytes);
  await assert.rejects(readFile(join(output, "transfer_confidential_2_2.key")), { code: "ENOENT" });
  const again = run(args);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /Using .*merge_8_1\.key/);
});

test("reads keys from the mirror ZOLANA_KEYS_BASE_URL names", async (context) => {
  const { root, output, bytes, run } = await fixture(context);
  await rm(join(root, "keys"), { recursive: true });
  const mirror = pathToFileURL(`${join(root, "mirror")}/`).href;
  const result = run(["--output", output, "--keys", "merge_8_1.key"], { ZOLANA_KEYS_BASE_URL: mirror });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(join(output, "merge_8_1.key")), bytes);
});

test("refuses key bytes that do not match the lockfile", async (context) => {
  const { root, output, run } = await fixture(context);
  await writeFile(join(root, "keys/transfer_confidential_1_2.key"), "corrupt");
  const result = run(["--output", output, "--keys", "transfer_confidential_1_2.key"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /transfer_confidential_1_2\.key has size/);
  await assert.rejects(readFile(join(output, "transfer_confidential_1_2.key")), { code: "ENOENT" });
});

test("rejects unsupported, malformed and duplicate selections and missing flags", async (context) => {
  const { output, run } = await fixture(context);
  for (const selection of [
    "transfer_confidential_99_99.key",
    "../transfer_confidential_1_2.key",
    "__proto__",
    "batch_address-append_40_10.key",
    "none",
    "transfer_confidential_1_2.key,",
    "transfer_confidential_1_2.key,transfer_confidential_1_2.key",
  ])
    assert.notEqual(run(["--output", output, "--keys", selection]).status, 0, selection);
  assert.notEqual(run(["--output", output]).status, 0);
  assert.notEqual(run(["--keys", "merge_8_1.key"]).status, 0);
  assert.notEqual(run(["--output", output, "--keys"]).status, 0);
  assert.notEqual(run(["--output", output, "--keys", "merge_8_1.key", "--keys", "merge_8_1.key"]).status, 0);
  await assert.rejects(readFile(join(output, "merge_8_1.key")), { code: "ENOENT" });
});
