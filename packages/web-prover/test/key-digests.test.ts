import { expect, it } from "vitest";
import { lockedBrowserKeys, lockedKeyBaseUrl, lockedKeySet } from "../scripts/generate-key-digests.ts";
import { KEY_BASE_URL, KEY_DIGESTS, KEY_SET } from "../src/key-digests.js";
import { MERGE_SHAPES, TRANSFER_SHAPES } from "../src/shapes.js";

it("matches proving-keys.lock (run scripts/generate-key-digests.ts after a rotation)", async () => {
  expect(KEY_DIGESTS).toEqual(await lockedBrowserKeys());
  expect(KEY_SET).toBe(await lockedKeySet());
  expect(KEY_BASE_URL).toBe(await lockedKeyBaseUrl());
});

it("pins a key for every shape the prover can be asked for", () => {
  for (const shape of [...TRANSFER_SHAPES, ...MERGE_SHAPES]) {
    expect(KEY_DIGESTS[shape.keyFile]?.size).toBe(shape.keyBytes);
  }
});
