import { expect, it } from "vitest";
import { describeError, RunRecorder } from "../src/bench.js";

it("does not serialize unknown error messages, details or causes into run records", () => {
  const sentinel = "review-private-sentinel";
  const error = Object.assign(new Error(sentinel, { cause: new Error(sentinel) }), {
    details: { witness: sentinel },
    causeCode: sentinel,
  });
  for (const value of [error, sentinel, { details: sentinel }]) {
    expect(describeError(value)).toBe("Operation failed");
    expect(JSON.stringify(new RunRecorder("2x3", "wasm").finish(value))).not.toContain(sentinel);
  }
});
