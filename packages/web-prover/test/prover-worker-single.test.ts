import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../src/wasm-prover.js";

const keySha256 = "ab".repeat(32);
const decodeKey = vi.hoisted(() =>
  vi.fn(async () => [
    new Uint8Array([10]),
    new Uint8Array([11]),
    new Uint8Array([12]),
    new Uint8Array([13]),
    new Uint8Array([14]),
  ]),
);
const importThreadedRuntime = vi.hoisted(() => vi.fn());
const importSingleRuntime = vi.hoisted(() => vi.fn());

vi.mock("../src/runtime.js", () => ({ importThreadedRuntime, importSingleRuntime }));
vi.mock("../src/key-decoders.js", () => ({ decodeKey }));

let scope: EventTarget & { postMessage: ReturnType<typeof vi.fn> };
let prover: Record<
  "digest" | "name" | "free" | "inputs" | "outputs" | "export_raw",
  ReturnType<typeof vi.fn>
>;
let single: {
  default: ReturnType<typeof vi.fn>;
  init_gpu: ReturnType<typeof vi.fn>;
  raw_format: ReturnType<typeof vi.fn>;
  ZolanaProver: ReturnType<typeof vi.fn> & { from_vectors: ReturnType<typeof vi.fn> };
};

beforeEach(async () => {
  vi.resetModules();
  decodeKey.mockClear();
  importThreadedRuntime.mockClear();
  importSingleRuntime.mockClear();
  scope = Object.assign(new EventTarget(), { postMessage: vi.fn() });
  prover = {
    digest: vi.fn(() => keySha256),
    name: vi.fn(() => "transfer_confidential_2_2"),
    free: vi.fn(),
    inputs: vi.fn(() => 2),
    outputs: vi.fn(() => 2),
    export_raw: vi.fn(() => new Uint8Array(0)),
  };
  const ZolanaProver = Object.assign(
    vi.fn(() => {
      throw new Error("constructor must not load a key file on the single path");
    }),
    { from_vectors: vi.fn(() => prover) },
  );
  single = {
    default: vi.fn(async () => {}),
    init_gpu: vi.fn(async () => {}),
    raw_format: vi.fn(() => "raw-test"),
    ZolanaProver,
  };
  importSingleRuntime.mockResolvedValue(single);
  importThreadedRuntime.mockRejectedValue(new Error("threaded runtime unused"));
  vi.stubGlobal("self", scope);
  vi.stubGlobal("crossOriginIsolated", false);
  await import("../src/prover.worker.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send(request: WorkerRequest): Promise<WorkerResponse> {
  scope.postMessage.mockClear();
  scope.dispatchEvent(new MessageEvent("message", { data: request }));
  await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
  return scope.postMessage.mock.calls[0]![0] as WorkerResponse;
}

it("starts the single-thread runtime without isolation or a thread pool", async () => {
  const response = await send({ id: 1, kind: "init", threads: 0 });
  expect(response.ok).toBe(true);
  expect(response.value).toMatchObject({ threads: 0, rawKeyFormat: "raw-test" });
  expect(importSingleRuntime).toHaveBeenCalledOnce();
  expect(importThreadedRuntime).not.toHaveBeenCalled();
  expect(single.default).toHaveBeenCalledOnce();
});

it("refuses threaded init without cross-origin isolation", async () => {
  const response = await send({ id: 1, kind: "init", threads: 2 });
  expect(response).toMatchObject({ ok: false, error: "wasm_init_failed" });
  expect(importThreadedRuntime).not.toHaveBeenCalled();
});

it("decompresses a key file across workers before from_vectors", async () => {
  expect((await send({ id: 1, kind: "init", threads: 0 })).ok).toBe(true);
  const key = new Uint8Array([1, 2, 3, 4]);
  const response = await send({
    id: 2,
    kind: "loadKey",
    fileName: "transfer_confidential_2_2.key",
    key: key.buffer,
    keySha256,
    exportRaw: false,
  });
  expect(response.ok).toBe(true);
  expect(decodeKey).toHaveBeenCalledOnce();
  expect(single.ZolanaProver.from_vectors).toHaveBeenCalledOnce();
  expect(single.ZolanaProver).not.toHaveBeenCalled();
});

it("loads a raw key through the constructor", async () => {
  expect((await send({ id: 1, kind: "init", threads: 0 })).ok).toBe(true);
  single.ZolanaProver.mockImplementation(function () {
    return prover;
  });
  const raw = Uint8Array.from([...new TextEncoder().encode("zopro-raw3"), 0, 0, 0, 0, 0, 0]);
  const response = await send({
    id: 2,
    kind: "loadKey",
    fileName: "transfer_confidential_2_2.key",
    key: raw.buffer,
    keySha256,
    exportRaw: false,
  });
  expect(response.ok).toBe(true);
  expect(decodeKey).not.toHaveBeenCalled();
  expect(single.ZolanaProver).toHaveBeenCalledOnce();
  expect(single.ZolanaProver.from_vectors).not.toHaveBeenCalled();
});
