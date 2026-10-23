import { expect, it } from "vitest";
import { neededKeys } from "../src/shapes.js";

const files = (shapes: ReturnType<typeof neededKeys>) => shapes.map((shape) => shape.keyFile);

it("names the keys of every spend and merge up to the limits, smallest first", () => {
  const needed = neededKeys(3, [2, 4], 30);
  expect([...files(needed)].sort()).toEqual(
    [
      "transfer_confidential_1_2.key",
      "transfer_confidential_1_4.key",
      "transfer_confidential_2_2.key",
      "transfer_confidential_2_4.key",
      "transfer_confidential_3_2.key",
      "transfer_confidential_3_4.key",
      "merge_8_1.key",
      "merge_24_1.key",
      "merge_54_1.key",
    ].sort(),
  );
  const sizes = needed.map((shape) => shape.keyBytes);
  expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
});

it("takes the smallest shape that holds a spend, and no merge below two notes", () => {
  expect(files(neededKeys(2, [3], 1))).toEqual([
    "transfer_confidential_1_4.key",
    "transfer_confidential_2_4.key",
  ]);
  expect(files(neededKeys(0, [2], 8))).toEqual(["merge_8_1.key"]);
});

it("refuses limits no pinned key holds", () => {
  expect(() => neededKeys(1, [2], 55)).toThrow("no supported merge holds 55 notes");
  expect(() => neededKeys(50, [2], 0)).toThrow("no supported shape holds 50x2");
});

it("lists every pinned transfer and merge key, smallest first, so the first fit is the cheapest", async () => {
  const { KEY_DIGESTS } = await import("../src/key-digests.js");
  const { MERGE_SHAPE, MERGE_SHAPES, TRANSFER_SHAPES, canonicalShape } = await import("../src/shapes.js");
  const listed = [...TRANSFER_SHAPES, ...MERGE_SHAPES].map((shape) => shape.keyFile).sort();
  expect(listed).toEqual(Object.keys(KEY_DIGESTS).sort());
  for (const shapes of [TRANSFER_SHAPES, MERGE_SHAPES]) {
    const sizes = shapes.map((shape) => shape.keyBytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(sizes.every((size, index) => index === 0 || sizes[index - 1] !== size)).toBe(true);
  }
  expect(MERGE_SHAPE.keyFile).toBe("merge_8_1.key");
  expect(canonicalShape(2, 2).keyFile).toBe("transfer_confidential_2_2.key");
  expect(canonicalShape(3, 3).keyFile).toBe("transfer_confidential_3_4.key");
});
