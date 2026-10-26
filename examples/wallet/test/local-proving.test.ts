import assert from "node:assert/strict";
import { test } from "node:test";
import { limitLocalProofs, localSpendLimit, MERGE_FIRST } from "../src/local-proving.ts";

test("the local spend limit uses the eight largest notes without changing them", () => {
  const notes = Array.from({ length: 9 }, (_, i) => ({ amount: BigInt(i + 1) }));
  assert.equal(localSpendLimit(notes), 44n);
  assert.equal(notes[0]?.amount, 1n);
  assert.equal(localSpendLimit([]), 0n);
});

test("a ninth input is refused before starting a local proof", async () => {
  let calls = 0;
  const localFetch: typeof fetch = async () => { calls++; return new Response("ok"); };
  const guarded = limitLocalProofs(localFetch, "http://127.0.0.1:3001");
  const prove = (inputs: number) => guarded("http://127.0.0.1:3001/prove/key", {
    method: "POST", body: JSON.stringify({ inputs: Array(inputs).fill({}) }),
  });
  await prove(8);
  assert.equal(calls, 1);
  await assert.rejects(prove(9), { message: MERGE_FIRST });
  assert.equal(calls, 1);
  await guarded(new Request("http://127.0.0.1:3001/prove/key", {
    method: "POST", body: JSON.stringify({ inputs: Array(8).fill({}) }),
  }));
  assert.equal(calls, 2);
});

test("RPC and remote merge requests do not use the local proof limit", async () => {
  let calls = 0;
  const guarded = limitLocalProofs(async () => { calls++; return new Response("ok"); }, "http://127.0.0.1:3001");
  await guarded("https://rpc.example/getBalance", { method: "POST", body: "{}" });
  await guarded("https://tee.example/prove/key", { method: "POST", body: JSON.stringify({ inputs: Array(24).fill({}) }) });
  assert.equal(calls, 2);
});
