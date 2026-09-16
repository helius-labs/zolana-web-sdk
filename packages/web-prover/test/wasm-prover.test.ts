import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZolanaWebProver } from "../src/index.js";
import {
  WasmProver,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerFatal,
} from "../src/wasm-prover.js";
import type { Measurement } from "../src/measurement.js";
import { TRANSFER_SHAPES } from "../src/shapes.js";

const body = JSON.stringify({ circuitType: "transfer-confidential", nInputs: 2, nOutputs: 3 });
const endpoint = "http://localhost:3001/prove";
const key = new Uint8Array([1, 2, 3]);
const factory = () => new Worker("test-worker");

class TestWorker extends EventTarget {
  static instances: TestWorker[] = [];
  static holdInit = false;
  static throwOnPost = false;
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
        value = { threads: 2 };
        break;
      case "loadKey":
        value = { key: request.fileName };
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
function current(): TestWorker {
  const worker = TestWorker.instances.at(-1);
  if (worker === undefined) throw new Error("no worker");
  return worker;
}
function request(worker: TestWorker, kind: WorkerRequest["kind"]): WorkerRequest {
  const found = worker.requests.find((value) => value.kind === kind);
  if (found === undefined) throw new Error(`missing ${kind}`);
  return found;
}
function failure(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error("unexpected success");
    },
    (error: unknown) => error,
  );
}
async function fixture(onMeasurement: (measurement: Measurement) => void = () => {}) {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", key)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (String(input).endsWith("manifest.json")) {
      return Response.json(
        Object.fromEntries(
          TRANSFER_SHAPES.map((shape) => [shape.keyFile, { size: key.length, sha256: digest }]),
        ),
      );
    }
    return new Response(key);
  });
  const prover = new WasmProver({
    wasmUrl: "/prover/test.wasm",
    keyBaseUrl: "/keys",
    proverUrl: "http://localhost:3001",
    onMeasurement,
    fetch,
  });
  return { prover, fetch };
}

beforeEach(() => {
  TestWorker.instances = [];
  TestWorker.holdInit = false;
  TestWorker.throwOnPost = false;
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("caches", undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prover lifecycle", () => {
  it("starts its bundled worker automatically and exposes the product alias", async () => {
    const { prover } = await fixture();
    expect(prover).toBeInstanceOf(ZolanaWebProver);
    const result = await prover.proveRequest(body);
    expect(result).toEqual({ proof: '{"proof":"test"}', proveMs: 1, verifyMs: 1 });
    expect(TestWorker.instances).toHaveLength(1);
    prover.terminate();
  });

  it("shares initialization across concurrent starts", async () => {
    const { prover } = await fixture();
    TestWorker.holdInit = true;
    const first = prover.start(factory);
    const second = prover.start(factory);
    expect(first).toBe(second);
    expect(TestWorker.instances).toHaveLength(1);
    current().reply(request(current(), "init"));
    await Promise.all([first, second]);
    expect(prover.threads).toBe(2);
    prover.terminate();
  });

  it.each(["error", "messageerror", "fatal"])(
    "discards state on %s, rejects queued work, and reloads keys on retry",
    async (kind) => {
      const { prover } = await fixture();
      await prover.start(factory);
      await prover.proveRequest(body);
      const old = current();
      old.hold = "prove";
      const pending = failure(prover.proveRequest(body));
      const queued = failure(prover.proveRequest(body));
      await vi.waitFor(() =>
        expect(old.requests.filter((r) => r.kind === "prove")).toHaveLength(2),
      );
      if (kind === "error") old.crash();
      else if (kind === "fatal") old.message({ fatal: true, error: "Go exited" });
      else old.dispatchEvent(new Event("messageerror"));
      expect(await pending).toBeInstanceOf(Error);
      expect(await queued).toBeInstanceOf(Error);
      expect(old.terminated).toBe(true);
      expect(prover.threads).toBe(0);
      await prover.proveRequest(body);
      expect(TestWorker.instances).toHaveLength(2);
      expect(current().requests.filter((r) => r.kind === "loadKey")).toHaveLength(1);
      old.crash();
      old.message({ fatal: true, error: "late error" });
      await prover.proveRequest(body);
      expect(current().terminated).toBe(false);
      prover.terminate();
    },
  );

  it.each(["response", "postMessage"])(
    "cleans up failed initialization (%s) and can start again",
    async (kind) => {
      const { prover } = await fixture();
      TestWorker.holdInit = true;
      TestWorker.throwOnPost = kind === "postMessage";
      const failed = failure(prover.start(factory));
      const old = current();
      if (kind === "response")
        old.message({ id: request(old, "init").id, ok: false, error: "missing Wasm", ms: 0 });
      expect(await failed).toBeInstanceOf(Error);
      expect(old.terminated).toBe(true);
      TestWorker.holdInit = false;
      TestWorker.throwOnPost = false;
      await prover.start(factory);
      await prover.proveRequest(body);
      prover.terminate();
    },
  );

  it("manual termination rejects downloads and does not resurrect the runtime", async () => {
    const { prover, fetch } = await fixture();
    await prover.start(factory);
    fetch.mockImplementation(() => new Promise(() => {}));
    const pending = failure(prover.proveRequest(body));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    prover.terminate();
    expect(await pending).toBeInstanceOf(Error);
    await expect(prover.proveRequest(body)).rejects.toThrow("not started");
    expect(TestWorker.instances).toHaveLength(1);
  });
});

describe("fetch cancellation", () => {
  it("delegates same-origin prove paths outside the configured endpoint", async () => {
    const { prover, fetch } = await fixture();
    const input = "http://localhost:3001/other/prove";
    const init = { method: "POST", body };

    await prover.createFetch()(input, init);

    expect(fetch).toHaveBeenCalledWith(input, init);
    expect(TestWorker.instances).toHaveLength(0);
  });

  it("rejects a pre-aborted signal before any key fetch or worker work", async () => {
    const { prover, fetch } = await fixture();
    const signal = AbortSignal.abort();
    await expect(prover.createFetch()(endpoint, { method: "POST", body, signal })).rejects.toBe(
      signal.reason,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(TestWorker.instances).toHaveLength(0);
  });

  it("cancels a queued request without terminating active proving", async () => {
    const { prover } = await fixture();
    await prover.start(factory);
    const worker = current();
    worker.hold = "prove";
    const first = prover.proveRequest(body);
    await vi.waitFor(() => expect(worker.requests.some((r) => r.kind === "prove")).toBe(true));
    const controller = new AbortController();
    const queued = failure(
      prover.createFetch()(endpoint, { method: "POST", body, signal: controller.signal }),
    );
    controller.abort();
    expect(await queued).toBe(controller.signal.reason);
    expect(worker.terminated).toBe(false);
    worker.hold = undefined;
    worker.reply(request(worker, "prove"));
    await first;
    await prover.proveRequest(body);
    expect(worker.requests.filter((r) => r.kind === "prove")).toHaveLength(2);
    prover.terminate();
  });

  it.each(["loadKey", "prove", "verify"] as const)(
    "terminates active %s on Request cancellation and reloads after retry",
    async (kind) => {
      const { prover } = await fixture();
      await prover.start(factory);
      const worker = current();
      worker.hold = kind;
      const controller = new AbortController();
      const pending = failure(
        prover.createFetch()(
          new Request(endpoint, { method: "POST", body, signal: controller.signal }),
        ),
      );
      await vi.waitFor(() => expect(worker.requests.some((r) => r.kind === kind)).toBe(true));
      controller.abort();
      expect(await pending).toBe(controller.signal.reason);
      expect(worker.terminated).toBe(true);
      await prover.proveRequest(body);
      expect(TestWorker.instances).toHaveLength(2);
      expect(current().requests.filter((r) => r.kind === "loadKey")).toHaveLength(1);
      prover.terminate();
    },
  );

  it("propagates cancellation to downloads and suppresses late key installation", async () => {
    const { prover, fetch } = await fixture();
    await prover.start(factory);
    const controller = new AbortController();
    const download = Promise.withResolvers<Response>();
    const normalFetch = fetch.getMockImplementation();
    if (normalFetch === undefined) throw new Error("missing fetch implementation");
    let downloadSignal: AbortSignal | null | undefined;
    fetch.mockImplementation(async (input, init) => {
      if (String(input).endsWith(".key")) {
        downloadSignal = init?.signal;
        return download.promise;
      }
      return normalFetch(input, init);
    });
    const pending = failure(
      prover.createFetch()(endpoint, { method: "POST", body, signal: controller.signal }),
    );
    await vi.waitFor(() => expect(downloadSignal).toBeDefined());
    controller.abort();
    expect(await pending).toBe(controller.signal.reason);
    expect(downloadSignal?.aborted).toBe(true);
    fetch.mockImplementation(normalFetch);
    await prover.proveRequest(body);
    download.resolve(new Response(key));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(TestWorker.instances[0]?.requests.some((r) => r.kind === "loadKey")).toBe(false);
    expect(current().requests.filter((r) => r.kind === "loadKey")).toHaveLength(1);
    prover.terminate();
  });

  it.each(["key-fetch", "key-load"])(
    "cannot install stale key state when a %s callback cancels and restarts",
    async (step) => {
      const controller = new AbortController();
      let restarted: Promise<void> | undefined;
      const { prover } = await fixture((measurement) => {
        if (measurement.step === step && !controller.signal.aborted) {
          controller.abort();
          restarted = prover.start(factory);
        }
      });
      await prover.start(factory);
      const error = await failure(prover.proveRequest(body, controller.signal));
      expect(error).toBe(controller.signal.reason);
      await restarted;
      await prover.proveRequest(body);
      expect(TestWorker.instances).toHaveLength(2);
      expect(current().requests.filter((r) => r.kind === "loadKey")).toHaveLength(1);
      prover.terminate();
    },
  );

  it("RequestInit can override a Request's aborted signal", async () => {
    const { prover } = await fixture();
    await prover.start(factory);
    const req = new Request(endpoint, { method: "POST", body, signal: AbortSignal.abort() });
    expect((await prover.createFetch()(req, { signal: null })).status).toBe(200);
    prover.terminate();
  });
});

describe("witness privacy", () => {
  const sentinel = "review-private-sentinel";

  it.each(["init", "loadKey", "prove", "verify"] as const)(
    "redacts raw %s failures in the API, fetch adapter and measurements",
    async (kind) => {
      const measurements: Measurement[] = [];
      const logging = vi.spyOn(console, "error").mockImplementation(() => {});
      const { prover } = await fixture((measurement) => measurements.push(measurement));
      const reply = TestWorker.prototype.reply;
      vi.spyOn(TestWorker.prototype, "reply").mockImplementation(
        function (this: TestWorker, request) {
          if (request.kind === kind) {
            this.message({ id: request.id, ok: false, error: sentinel, ms: 0 });
          } else reply.call(this, request);
        },
      );
      const error = await failure(prover.proveRequest(body));
      expect(error).toMatchObject({ name: "WasmProverError" });
      expect(String(error)).not.toContain(sentinel);
      expect(error).not.toHaveProperty("cause");
      const response = await prover.createFetch()(endpoint, { method: "POST", body });
      expect(response.status).toBe(500);
      const responseBody = await response.json();
      expect(responseBody).toMatchObject({ code: expect.stringMatching(/^wasm_/) });
      expect(JSON.stringify(responseBody)).not.toContain(sentinel);
      expect(JSON.stringify(measurements)).not.toContain(sentinel);
      expect(logging).not.toHaveBeenCalled();
      prover.terminate();
    },
  );

  it.each(["fatal", "error"])("redacts %s runtime failures", async (kind) => {
    const { prover } = await fixture();
    await prover.start(factory);
    current().hold = "prove";
    const pending = failure(prover.proveRequest(body));
    await vi.waitFor(() =>
      expect(current().requests.some((request) => request.kind === "prove")).toBe(true),
    );
    if (kind === "fatal") current().message({ fatal: true, error: sentinel });
    else {
      const event = new Event("error", { cancelable: true });
      Object.assign(event, { message: sentinel });
      current().dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(await pending).toMatchObject({
      code: "wasm_worker_failed",
      message: "Prover worker failed",
    });
    prover.terminate();
  });
});

describe("best-effort proving-key cache", () => {
  function cacheFixture() {
    const cache = {
      match: vi.fn(async () => new Response(new Uint8Array([9, 9, 9]))),
      delete: vi.fn(async () => true),
      put: vi.fn(async () => {}),
    };
    const storage = { open: vi.fn(async () => cache) };
    vi.stubGlobal("caches", storage);
    return { cache, storage };
  }

  it.each(["open", "match", "delete", "put", "body", "getter"] as const)(
    "continues with validated network bytes when cache %s throws",
    async (operation) => {
      const { prover, fetch } = await fixture();
      const { cache, storage } = cacheFixture();
      const error = new DOMException("storage unavailable", "QuotaExceededError");
      if (operation === "open") storage.open.mockRejectedValue(error);
      else if (operation === "getter") {
        Object.defineProperty(globalThis, "caches", {
          configurable: true,
          get() {
            throw error;
          },
        });
      } else if (operation === "body") {
        cache.match.mockResolvedValue(
          Object.assign(new Response(), { arrayBuffer: () => Promise.reject(error) }),
        );
      } else cache[operation].mockRejectedValue(error);
      await expect(prover.proveRequest(body)).resolves.toHaveProperty("proof");
      expect(fetch.mock.calls.filter(([input]) => String(input).endsWith(".key"))).toHaveLength(1);
      expect(
        new Uint8Array(
          (request(current(), "loadKey") as Extract<WorkerRequest, { kind: "loadKey" }>).key,
        ),
      ).toEqual(key);
      prover.terminate();
    },
  );

  it.each(["open", "match", "delete", "put"] as const)(
    "does not swallow a cache %s AbortError",
    async (operation) => {
      const { prover } = await fixture();
      const { cache, storage } = cacheFixture();
      const error = new DOMException("cancelled", "AbortError");
      if (operation === "open") storage.open.mockRejectedValue(error);
      else cache[operation].mockRejectedValue(error);
      await expect(prover.createFetch()(endpoint, { method: "POST", body })).rejects.toBe(error);
      expect(current().requests.some((request) => request.kind === "loadKey")).toBe(false);
      prover.terminate();
    },
  );

  it.each(["open", "match", "delete", "put"] as const)(
    "cancels a pending cache %s without installing a late key",
    async (operation) => {
      const { prover } = await fixture();
      const { cache, storage } = cacheFixture();
      const pendingCache = Promise.withResolvers<never>();
      const pendingOperation = operation === "open" ? storage.open : cache[operation];
      pendingOperation.mockImplementation(() => pendingCache.promise);
      const controller = new AbortController();
      const pending = failure(prover.proveRequest(body, controller.signal));
      await vi.waitFor(() => expect(pendingOperation).toHaveBeenCalled());
      controller.abort();
      expect(await pending).toBe(controller.signal.reason);
      pendingCache.reject(new DOMException("late storage error", "QuotaExceededError"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(current().requests.some((request) => request.kind === "loadKey")).toBe(false);
      prover.terminate();
    },
  );

  it("uses a validated cache hit without downloading the key", async () => {
    const { prover, fetch } = await fixture();
    const { cache } = cacheFixture();
    cache.match.mockResolvedValue(new Response(key));
    await prover.proveRequest(body);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    prover.terminate();
  });

  it("rejects tampered network bytes even when stale-cache eviction fails", async () => {
    const { prover, fetch } = await fixture();
    const { cache } = cacheFixture();
    cache.delete.mockRejectedValue(new DOMException("denied", "SecurityError"));
    const normal = fetch.getMockImplementation()!;
    fetch.mockImplementation((input, init) =>
      String(input).endsWith(".key")
        ? Promise.resolve(new Response(new Uint8Array([4, 5, 6])))
        : normal(input, init),
    );
    await expect(prover.proveRequest(body)).rejects.toMatchObject({
      code: "wasm_key_digest_mismatch",
    });
    expect(cache.put).not.toHaveBeenCalled();
    expect(current().requests.some((request) => request.kind === "loadKey")).toBe(false);
    prover.terminate();
  });

  it.each(["cached", "network"])("preserves %s digest implementation failures", async (source) => {
    const { prover, fetch } = await fixture();
    const { storage } = cacheFixture();
    if (source === "network")
      storage.open.mockRejectedValue(new DOMException("denied", "SecurityError"));
    const error = new Error("digest unavailable");
    vi.spyOn(crypto.subtle, "digest").mockRejectedValue(error);
    await expect(prover.proveRequest(body)).rejects.toBe(error);
    expect(fetch).toHaveBeenCalledTimes(source === "cached" ? 1 : 2);
    expect(current().requests.some((request) => request.kind === "loadKey")).toBe(false);
    prover.terminate();
  });
});
