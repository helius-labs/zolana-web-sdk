import assert from "node:assert/strict";
import { test } from "node:test";
import { SHIELDED_POOL_PROGRAM_ID, USER_REGISTRY_PROGRAM_ID } from "@heliuslabs/zolana/interface";
import { teePolicyFromJson } from "@heliuslabs/zolana/client";
import { ZOLANA_DEPLOYMENTS, ZOLANA_PROGRAM_IDS } from "../../../packages/web-prover/src/deployments.ts";
import { burnerStorageKey, loadBurnerSeed, resetBurner } from "../src/burner.ts";

test("deployment pins agree with the installed protocol SDK and its policy parser", () => {
  assert.equal(SHIELDED_POOL_PROGRAM_ID, ZOLANA_PROGRAM_IDS.shieldedPool);
  assert.equal(USER_REGISTRY_PROGRAM_ID, ZOLANA_PROGRAM_IDS.userRegistry);
  for (const { proverTee } of Object.values(ZOLANA_DEPLOYMENTS)) {
    assert.deepEqual(teePolicyFromJson({
      platform: proverTee.platform,
      measurements: proverTee.measurements,
      gpu: proverTee.gpu,
      max_age_secs: proverTee.maxAgeSecs,
    }), proverTee);
    assert.ok(Object.isFrozen(proverTee.measurements[0]));
  }
  assert.notDeepEqual(ZOLANA_DEPLOYMENTS.devnet.proverTee, ZOLANA_DEPLOYMENTS.mainnet.proverTee);
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
