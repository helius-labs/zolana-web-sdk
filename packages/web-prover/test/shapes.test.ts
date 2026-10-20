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
