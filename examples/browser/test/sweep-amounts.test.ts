import { expect, it } from "vitest";
import { sweepAmounts } from "../src/sweep-amounts.js";

// The notes are equal, so any selector needs all of them exactly when no N-1
// notes cover the transfer; the change is then what the withdrawal spends.
it.each([1, 2, 3, 4, 5])(
  "requires all %i equal notes and retains enough for withdrawal",
  (notes) => {
    const shieldAmount = 12_000_000n;
    const note = shieldAmount / BigInt(notes);
    const amounts = sweepAmounts(shieldAmount, notes);
    expect(amounts.transfer).toBeGreaterThan(note * BigInt(notes - 1));
    expect(amounts.transfer).toBeLessThanOrEqual(note * BigInt(notes));
    expect(note * BigInt(notes) - amounts.transfer).toBe(amounts.withdrawal);
    expect(amounts.withdrawal).toBeGreaterThan(0n);
  },
);
it("rejects invalid or indivisible sweep amounts", () => {
  for (const [amount, notes] of [
    [0n, 1],
    [1n, 1],
    [12n, 0],
    [12n, 6],
    [12n, 1.5],
    [13n, 5],
  ] as const) {
    expect(() => sweepAmounts(amount, notes)).toThrow();
  }
});
