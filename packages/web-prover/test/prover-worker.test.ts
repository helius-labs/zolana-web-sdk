import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../src/wasm-prover.js";

const sentinel = "review-private-sentinel";
const keySha256 = "ab".repeat(32);
let scope: EventTarget & { postMessage: ReturnType<typeof vi.fn> };
let prover: Record<
  "name" | "digest" | "inputs" | "outputs" | "has_gpu" | "drop_gpu" | "export_raw" | "prove" | "free",
  ReturnType<typeof vi.fn>
>;
let runtime: Record<"default" | "initThreadPool" | "init_gpu" | "raw_format", ReturnType<typeof vi.fn>> & {
  ZolanaProver: ReturnType<typeof vi.fn>;
};
let initialized: WorkerResponse;

vi.mock("../src/runtime.js", () => ({ importRuntime: vi.fn(async () => runtime) }));

beforeEach(async () => {
  vi.resetModules();
  scope = Object.assign(new EventTarget(), { postMessage: vi.fn() });
  prover = {
    name: vi.fn(() => "transfer_confidential_2_2"),
    digest: vi.fn(() => keySha256),
    inputs: vi.fn(() => 2),
    outputs: vi.fn(() => 2),
    has_gpu: vi.fn(() => false),
    drop_gpu: vi.fn(),
    export_raw: vi.fn(() => new Uint8Array([7, 7, 7])),
    prove: vi.fn(async () => ({ proof: "{}", witnessMs: 1, proveMs: 2, verifyMs: 3 })),
    free: vi.fn(),
  };
  runtime = {
    default: vi.fn(async () => {}),
    initThreadPool: vi.fn(async () => {}),
    init_gpu: vi.fn(async () => {}),
    raw_format: vi.fn(() => "raw-test"),
    ZolanaProver: vi.fn(function () {
      return prover;
    }),
  };
  vi.stubGlobal("self", scope);
  vi.stubGlobal("crossOriginIsolated", true);
  await import("../src/prover.worker.js");
  initialized = await send({ id: 1, kind: "init", threads: 2, runtimeUrl: "/prover/" });
  expect(initialized.ok).toBe(true);
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

function loadKey(exportRaw = false): Promise<WorkerResponse> {
  return send({
    id: 2,
    kind: "loadKey",
    fileName: "transfer_confidential_2_2.key",
    key: new Uint8Array([1, 2, 3]).buffer,
    keySha256,
    exportRaw,
  });
}

it("starts the runtime's thread pool and reports its raw key format", () => {
  expect(runtime.initThreadPool).toHaveBeenCalledWith(2);
  expect(initialized.value).toMatchObject({ threads: 2, rawKeyFormat: "raw-test" });
});

it.each(["prove", "loadKey"] as const)(
  "does not send raw %s runtime errors across the worker boundary",
  async (kind) => {
    if (kind === "prove") expect((await loadKey()).ok).toBe(true);
    for (const throws of [false, true]) {
      const fail = () => {
        if (throws) throw new Error(sentinel, { cause: sentinel });
        return Promise.reject(sentinel);
      };
      if (kind === "prove") prover.prove.mockImplementation(fail);
      else runtime.ZolanaProver.mockImplementation(fail);
      const response =
        kind === "prove" ? await send({ id: 3, kind: "prove", body: sentinel }) : await loadKey();
      expect(response.ok).toBe(false);
      expect(response.error).toMatch(/^wasm_/);
      expect(JSON.stringify(response)).not.toContain(sentinel);
    }
  },
);

it("loads a key, checks the gnark key it was built from and moves its raw form to the page", async () => {
  const response = await loadKey(true);
  expect(response.ok).toBe(true);
  expect(new Uint8Array(runtime.ZolanaProver.mock.calls[0]![0])).toEqual(new Uint8Array([1, 2, 3]));
  expect(response.value).toMatchObject({ key: "transfer_confidential_2_2", inputs: 2, outputs: 2 });
  const raw = (response.value as { raw: Uint8Array }).raw;
  expect(scope.postMessage.mock.calls[0]![1]).toEqual([raw.buffer]);
  expect((await send({ id: 3, kind: "loadedKeys" })).value).toEqual({
    keys: ["transfer_confidential_2_2.key"],
  });
});

it("refuses a key built from another gnark key", async () => {
  prover.digest.mockReturnValue("cd".repeat(32));
  const response = await loadKey();
  expect(response).toMatchObject({ ok: false, error: "wasm_key_digest_mismatch" });
  expect(prover.free).toHaveBeenCalled();
  expect((await send({ id: 3, kind: "loadedKeys" })).value).toEqual({ keys: [] });
});

it("frees the loaded key before it loads the next", async () => {
  await loadKey();
  await loadKey();
  expect(prover.free).toHaveBeenCalledOnce();
});

it("returns the runtime's verified proof", async () => {
  await loadKey();
  const response = await send({ id: 3, kind: "prove", body: "{}" });
  expect(response.value).toEqual({ proof: "{}", witnessMs: 1, proveMs: 2, verifyMs: 3 });
});

it("proves again on the CPU when a GPU proof does not verify", async () => {
  await loadKey();
  prover.has_gpu.mockReturnValue(true);
  prover.prove.mockRejectedValueOnce("unverified");
  const response = await send({ id: 3, kind: "prove", body: "{}" });
  expect(response.ok).toBe(true);
  expect(prover.drop_gpu).toHaveBeenCalledOnce();
  expect(prover.prove).toHaveBeenCalledTimes(2);
});

it("fails a CPU proof that does not verify", async () => {
  await loadKey();
  prover.prove.mockRejectedValue("unverified");
  const response = await send({ id: 3, kind: "prove", body: "{}" });
  expect(response).toMatchObject({ ok: false, error: "wasm_verify_failed" });
  expect(prover.drop_gpu).not.toHaveBeenCalled();
});
