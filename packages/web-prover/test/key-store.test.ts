import { beforeEach, expect, it, vi } from "vitest";
import { WasmProver } from "../src/wasm-prover.js";
import type { KeyProgress } from "../src/measurement.js";
import { MERGE_SHAPES, TRANSFER_SHAPES } from "../src/shapes.js";
import { proverTestHooks } from "./support/prover.js";

// Every pinned key is these 20 MB here: three ranged parts of 8, 8 and 4 MB.
const { key } = vi.hoisted(() => {
  const key = new Uint8Array(20 << 20);
  for (let index = 0; index < key.length; index++) key[index] = (index * 31 + 7) & 0xff;
  return { key };
});
vi.mock("../src/key-digests.js", async (importOriginal) => {
  const { createHash } = await import("node:crypto");
  const original = await importOriginal<typeof import("../src/key-digests.js")>();
  const digest = { size: key.length, sha256: createHash("sha256").update(key).digest("hex") };
  return {
    ...original,
    KEY_DIGESTS: Object.fromEntries(
      Object.entries(original.KEY_DIGESTS).map(([name, entry]) => [name, { ...entry, ...digest }]),
    ),
  };
});

const part = 8 << 20;
const body = JSON.stringify({ circuitType: "transfer-confidential", nInputs: 2, nOutputs: 2 });
const pinnedUrl = "/keys/transfer_confidential_2_2.zopro";
const rawUrl = `${pinnedUrl}?zolana-key=raw`;
const partUrl = (index: number) => `${pinnedUrl}?zolana-key=part-${String(index)}`;
const range = (start: number, end: number) => `bytes=${String(start)}-${String(end - 1)}`;

proverTestHooks();
let entries: Map<string, Response>;

beforeEach(() => {
  entries = new Map();
  const cache = {
    match: vi.fn(async (url: string) => entries.get(url)?.clone()),
    put: vi.fn(async (url: string, response: Response) => {
      entries.set(url, response);
    }),
    delete: vi.fn(async (url: string) => entries.delete(url)),
  };
  vi.stubGlobal("caches", {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => {
      entries.clear();
      return true;
    }),
  });
});

/**
 * A key host that answers ranges with 206, or with 200 as an extension's own files do,
 * or ignores them; `failFrom` drops the connection at a part.
 */
function host(options: Readonly<{ ignoreRanges?: boolean; rangeStatus?: number; failFrom?: number }> = {}) {
  const ranges: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
    const requested = new Headers(init?.headers).get("range");
    ranges.push(requested ?? "");
    if (requested === null || options.ignoreRanges === true) return new Response(key.slice());
    const [start, end] = requested.slice("bytes=".length).split("-").map(Number) as [number, number];
    if (options.failFrom !== undefined && start >= options.failFrom) throw new TypeError("connection dropped");
    return new Response(key.slice(start, end + 1), { status: options.rangeStatus ?? 206 });
  });
  return { fetch, ranges };
}

function prover(fetch: typeof globalThis.fetch, onKeyProgress?: (progress: KeyProgress) => void) {
  return new WasmProver({
    keyBaseUrl: "/keys",
    proverUrl: "http://localhost:3001",
    fetch,
    ...(onKeyProgress === undefined ? {} : { onKeyProgress }),
  });
}

it("downloads a key in ranged parts and keeps only its decoded form", async () => {
  const { fetch, ranges } = host();
  const progress: KeyProgress[] = [];
  const instance = prover(fetch, (update) => progress.push(update));
  await instance.proveRequest(body);
  expect(ranges).toEqual([range(0, part), range(part, 2 * part), range(2 * part, key.length)]);
  expect(progress.filter((update) => update.stage === "download").at(-1)?.loaded).toBe(key.length);
  expect([...entries.keys()]).toEqual([rawUrl]);
  instance.terminate();
});

it("resumes an interrupted download from the parts it kept", async () => {
  const first = prover(host({ failFrom: part }).fetch);
  await expect(first.proveRequest(body)).rejects.toThrow();
  first.terminate();
  expect([...entries.keys()]).toEqual([partUrl(0)]);

  const { fetch, ranges } = host();
  const second = prover(fetch);
  const status = (await second.provingKeys()).find((entry) => entry.keyFile === "transfer_confidential_2_2.key");
  expect(status).toEqual({ keyFile: "transfer_confidential_2_2.key", size: key.length, downloaded: part, decoded: false });
  await second.proveRequest(body);
  expect(ranges).toEqual([range(part, 2 * part), range(2 * part, key.length)]);
  expect([...entries.keys()]).toEqual([rawUrl]);
  second.terminate();
});

it("takes the whole key from a host that ignores ranges", async () => {
  const { fetch, ranges } = host({ ignoreRanges: true });
  const instance = prover(fetch);
  await instance.proveRequest(body);
  expect(ranges).toEqual([range(0, part)]);
  expect([...entries.keys()]).toEqual([rawUrl]);
  instance.terminate();
});

it("takes the ranges an extension's own files answer with 200", async () => {
  const { fetch, ranges } = host({ rangeStatus: 200 });
  const instance = prover(fetch);
  await instance.proveRequest(body);
  expect(ranges).toEqual([range(0, part), range(part, 2 * part), range(2 * part, key.length)]);
  expect([...entries.keys()]).toEqual([rawUrl]);
  instance.terminate();
});

it("starts over once when a kept part is stale", async () => {
  entries.set(partUrl(0), new Response(new Uint8Array(part)));
  const { fetch, ranges } = host();
  const instance = prover(fetch);
  await instance.proveRequest(body);
  expect(ranges).toEqual([
    range(part, 2 * part),
    range(2 * part, key.length),
    range(0, part),
    range(part, 2 * part),
    range(2 * part, key.length),
  ]);
  expect([...entries.keys()]).toEqual([rawUrl]);
  instance.terminate();
});

it("reports every key smallest first and clears them", async () => {
  const instance = prover(host().fetch);
  const before = await instance.provingKeys();
  expect(before.map((entry) => entry.keyFile).sort()).toEqual(
    [...TRANSFER_SHAPES, ...MERGE_SHAPES].map((shape) => shape.keyFile).sort(),
  );
  expect(before.every((entry) => entry.downloaded === 0 && !entry.decoded)).toBe(true);
  await instance.proveRequest(body);
  const after = await instance.provingKeys();
  expect(after.find((entry) => entry.keyFile === "transfer_confidential_2_2.key")).toMatchObject({
    downloaded: key.length,
    decoded: true,
  });
  await instance.clearKeys();
  expect(entries.size).toBe(0);
  expect((await instance.provingKeys()).every((entry) => entry.downloaded === 0)).toBe(true);
  instance.terminate();
});
