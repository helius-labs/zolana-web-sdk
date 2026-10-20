import { afterEach, beforeEach, vi } from "vitest";
import {
  WasmProver,
  type WasmProverOptions,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerFatal,
} from "../../src/wasm-prover.js";
import type { Measurement } from "../../src/measurement.js";

export const body = JSON.stringify({ circuitType: "transfer-confidential", nInputs: 2, nOutputs: 2 });
export const proveBase = "http://localhost:3001/prove";
export const endpoint = `${proveBase}/transfer_confidential_2_2`;
export const key = new Uint8Array([1, 2, 3]);
export const rawKey = new Uint8Array([7, 7, 7, 7]);
export const factory = () => new Worker("test-worker");

export class TestWorker extends EventTarget {
  static instances: TestWorker[] = [];
  static holdInit = false;
  static throwOnPost = false;
  static rawKeyFormat: string | undefined;
  static rejectRaw = false;
  readonly requests: WorkerRequest[] = [];
  terminated = false;
  hold: WorkerRequest["kind"] | undefined;
  constructor() {
    super();
    TestWorker.instances.push(this);
  }
  postMessage(request: WorkerRequest): void {
    if (TestWorker.throwOnPost) throw new Error("postMessage failed");
    this.requests.push(request);
    if (request.kind === this.hold || (request.kind === "init" && TestWorker.holdInit)) return;
    queueMicrotask(() => this.reply(request));
  }
  reply(request: WorkerRequest): void {
    let value: unknown;
    switch (request.kind) {
      case "init":
        value = { threads: 2, rawKeyFormat: TestWorker.rawKeyFormat };
        break;
      case "loadKey":
        if (TestWorker.rejectRaw && bytesEqual(request.key, rawKey)) {
          this.message({ id: request.id, ok: false, error: "wasm_key_load_failed", ms: 1 });
          return;
        }
        value = { key: request.fileName, raw: request.exportRaw ? rawKey.slice() : undefined };
        break;
      case "prove":
        value = '{"proof":"test"}';
        break;
      case "verify":
        value = { valid: true };
        break;
      case "loadedKeys":
        value = { keys: [] };
        break;
    }
    this.message({ id: request.id, ok: true, value, ms: 1 });
  }
  message(data: WorkerResponse | WorkerFatal): void {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  crash(): void {
    const event = new Event("error");
    Object.assign(event, { message: "worker crashed" });
    this.dispatchEvent(event);
  }
  terminate(): void {
    this.terminated = true;
  }
}
export function bytesEqual(buffer: ArrayBuffer, expected: Uint8Array): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);
}
export function current(): TestWorker {
  const worker = TestWorker.instances.at(-1);
  if (worker === undefined) throw new Error("no worker");
  return worker;
}
export function request(worker: TestWorker, kind: WorkerRequest["kind"]): WorkerRequest {
  const found = worker.requests.find((value) => value.kind === kind);
  if (found === undefined) throw new Error(`missing ${kind}`);
  return found;
}
export function failure(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error("unexpected success");
    },
    (error: unknown) => error,
  );
}
export async function fixture(
  onMeasurement: (measurement: Measurement) => void = () => {},
  options: Partial<WasmProverOptions> = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(key));
  const prover = new WasmProver({
    keyBaseUrl: "/keys",
    proverUrl: "http://localhost:3001",
    onMeasurement,
    fetch,
    ...options,
  });
  return { prover, fetch };
}


/** The worker stub and a clean cache before each test; call it at a test file's top level. */
export function proverTestHooks(): void {
  beforeEach(() => {
    TestWorker.instances = [];
    TestWorker.holdInit = false;
    TestWorker.throwOnPost = false;
    TestWorker.rawKeyFormat = "raw-test";
    TestWorker.rejectRaw = false;
    vi.stubGlobal("Worker", TestWorker);
    vi.stubGlobal("caches", undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
}
