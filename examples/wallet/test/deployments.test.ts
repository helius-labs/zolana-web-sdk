import assert from "node:assert/strict";
import { test } from "node:test";
import { SHIELDED_POOL_PROGRAM_ID, USER_REGISTRY_PROGRAM_ID } from "@heliuslabs/zolana/interface";
import { teePolicyFromJson } from "@heliuslabs/zolana/client";
import { ZOLANA_PROGRAM_IDS } from "../../../packages/web-prover/src/protocol.ts";
import { deployments, remoteProverConfig } from "../src/deployments.ts";
import { burnerStorageKey, loadBurnerSeed, resetBurner } from "../src/burner.ts";

test("deployment pins agree with the installed protocol SDK and its policy parser", () => {
  assert.equal(SHIELDED_POOL_PROGRAM_ID, ZOLANA_PROGRAM_IDS.shieldedPool);
  assert.equal(USER_REGISTRY_PROGRAM_ID, ZOLANA_PROGRAM_IDS.userRegistry);
  for (const { proverTee } of Object.values(deployments)) {
    assert.deepEqual(teePolicyFromJson({
      platform: proverTee.platform,
      measurements: proverTee.measurements,
      gpu: proverTee.gpu,
      max_age_secs: proverTee.maxAgeSecs,
      hpke_public_key: proverTee.hpkePublicKey,
    }), proverTee);
    assert.match(proverTee.hpkePublicKey ?? "", /^[0-9a-f]{64}$/u);
  }
  assert.notDeepEqual(deployments.devnet.proverTee, deployments.mainnet.proverTee);
});

test("demo keys stay separate across networks and preserve the old deployment's key", () => {
  const storage = new Map([["zolana-example-burner", "01".repeat(32)]]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  try {
    const devnet = loadBurnerSeed("devnet");
    const mainnet = loadBurnerSeed("mainnet");
    assert.notDeepEqual(devnet, mainnet);
    assert.deepEqual(loadBurnerSeed("devnet"), devnet);
    resetBurner("devnet");
    assert.equal(storage.has(burnerStorageKey("devnet")), false);
    assert.deepEqual(loadBurnerSeed("mainnet"), mainnet);
    assert.equal(storage.get("zolana-example-burner"), "01".repeat(32));
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("application policies work at direct, unified and proxy URLs without hostname selection", () => {
  const pinned = deployments.mainnet.proverTee;
  assert.equal(pinned.platform, "aws-nitro");
  if (pinned.platform !== "aws-nitro") throw new Error("expected Nitro policy");
  const policy = { platform: "aws-nitro", measurements: pinned.measurements,
    gpu: "optional", max_age_secs: 600, hpke_public_key: pinned.hpkePublicKey };
  for (const proverUrl of ["https://prover.example", "https://api.example/v1/zolana?api-key=secret", "http://localhost:8788/prover"]) {
    assert.deepEqual(remoteProverConfig(proverUrl, { deployment: policy }), { proverUrl, proverTee: pinned });
    assert.deepEqual(remoteProverConfig(proverUrl, policy).proverTee, pinned);
    for (const bad of [undefined, null, {}, { deployment: null }]) assert.throws(() => remoteProverConfig(proverUrl, bad));
  }
});
