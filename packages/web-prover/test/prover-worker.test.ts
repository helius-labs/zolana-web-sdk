import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkerRequest, WorkerResponse } from "../src/wasm-prover.js";

vi.mock("../src/vendor/wasm_exec.js", () => ({}));

const sentinel = "review-private-sentinel";
let scope: EventTarget & { postMessage: ReturnType<typeof vi.fn> };
let backend: Record<"prove" | "verify" | "loadKey" | "loadedKeys", ReturnType<typeof vi.fn>>;
let initialized: WorkerResponse;

beforeEach(async () => {
  vi.resetModules();
  scope = Object.assign(new EventTarget(), { postMessage: vi.fn() });
  backend = {
    prove: vi.fn(() => ({ proof: "{}" })),
    verify: vi.fn(() => ({ valid: true })),
    loadKey: vi.fn(() => ({})),
    loadedKeys: vi.fn(() => ({ keys: [] })),
  };
  vi.stubGlobal("self", scope);
  vi.stubGlobal("__zolanaProver", { ...backend, rawKeyFormat: "raw-test" });
  vi.stubGlobal("__zolanaProverReady", undefined);
  vi.stubGlobal(
    "Go",
    class {
      importObject = {};
      run() {
        (globalThis as unknown as { __zolanaProverReady(): void }).__zolanaProverReady();
        return new Promise<void>(() => {});
      }
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response()),
  );
  vi.spyOn(WebAssembly, "instantiateStreaming").mockResolvedValue(
    {} as WebAssembly.WebAssemblyInstantiatedSource,
  );
  await import("../src/prover.worker.js");
  initialized = await send({ id: 1, kind: "init", threads: 0 });
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

it.each(["prove", "verify", "loadKey", "loadedKeys"] as const)(
  "does not send raw %s backend errors across the worker boundary",
  async (kind) => {
    const request = {
      id: 2,
      kind,
      body: sentinel,
      proof: sentinel,
      fileName: "test.key",
      key: new ArrayBuffer(0),
    } as WorkerRequest;
    for (const throws of [false, true]) {
      backend[kind].mockImplementation(() => {
        if (throws) throw new Error(sentinel, { cause: sentinel });
        return { error: sentinel, code: sentinel };
      });
      const response = await send(request);
      expect(response.ok).toBe(false);
      expect(response.error).toMatch(/^wasm_/);
      expect(JSON.stringify(response)).not.toContain(sentinel);
    }
  },
);

it("reports the bridge's raw key format and moves a raw key back to the page", async () => {
  expect(initialized.value).toMatchObject({ rawKeyFormat: "raw-test" });
  const raw = new Uint8Array([7, 7, 7]);
  backend.loadKey.mockReturnValue({ key: "transfer_2_2", raw });
  const response = await send({
    id: 2,
    kind: "loadKey",
    fileName: "transfer_confidential_2_2.key",
    key: new Uint8Array([1, 2, 3]).buffer,
    sha256: "ab".repeat(32),
    exportRaw: true,
  });
  expect(response.ok).toBe(true);
  const [fileName, key, sha256, exportRaw] = backend.loadKey.mock.calls[0]!;
  expect([fileName, new Uint8Array(key), sha256, exportRaw]).toEqual([
    "transfer_confidential_2_2.key",
    new Uint8Array([1, 2, 3]),
    "ab".repeat(32),
    true,
  ]);
  expect(scope.postMessage.mock.calls[0]![1]).toEqual([raw.buffer]);
});
