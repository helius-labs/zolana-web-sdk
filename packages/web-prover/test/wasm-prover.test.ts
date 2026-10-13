import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZolanaWebProver } from "../src/index.js";
import { KEY_SET } from "../src/key-digests.js";
import {
  WasmProver,
  type WasmProverOptions,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerFatal,
} from "../src/wasm-prover.js";
import type { KeyProgress, Measurement } from "../src/measurement.js";
import { TRANSFER_SHAPES } from "../src/shapes.js";

const body = JSON.stringify({ circuitType: "transfer-confidential", nInputs: 2, nOutputs: 2 });
const proveBase = "http://localhost:3001/prove";
const endpoint = `${proveBase}/transfer_confidential_2_2`;
const key = new Uint8Array([1, 2, 3]);
const rawKey = new Uint8Array([7, 7, 7, 7]);
const factory = () => new Worker("test-worker");

// Every pinned key is the three bytes of `key` in these tests.
vi.mock("../src/key-digests.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/key-digests.js")>();
  const digest = { size: 3, sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81" };
  const KEY_DIGESTS = Object.fromEntries(Object.keys(original.KEY_DIGESTS).map((name) => [name, digest]));
  return { ...original, KEY_DIGESTS };
});

class TestWorker extends EventTarget {
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
function bytesEqual(buffer: ArrayBuffer, expected: Uint8Array): boolean {
  const bytes = new Uint8Array(buffer);
  return bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);
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
async function fixture(
  onMeasurement: (measurement: Measurement) => void = () => {},
  options: Partial<WasmProverOptions> = {},
) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(key));
  const prover = new WasmProver({
    wasmUrl: "/prover/test.wasm",
    keyBaseUrl: "/keys",
    proverUrl: "http://localhost:3001",
    onMeasurement,
    fetch,
    ...options,
  });
  return { prover, fetch };
}

beforeEach(() => {
  TestWorker.instances = [];
  TestWorker.holdInit = false;
  TestWorker.throwOnPost = false;
  TestWorker.rawKeyFormat = undefined;
  TestWorker.rejectRaw = false;
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

  it("answers a proving key's own path locally", async () => {
    const { prover, fetch } = await fixture();
    const response = await prover.createFetch()(endpoint, {
      method: "POST",
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"proof":"test"}');
    expect(fetch.mock.calls.map(([input]) => String(input))).not.toContain(
      endpoint,
    );
    prover.terminate();
  });

  it("answers the bare /prove from the key the body names", async () => {
    const { prover, fetch } = await fixture();
    const response = await prover.createFetch()(`${proveBase}?api-key=secret`, {
      method: "POST",
      body,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"proof":"test"}');
    expect(fetch.mock.calls.map(([input]) => String(input))).not.toContain(
      `${proveBase}?api-key=secret`,
    );
    expect(request(current(), "loadKey")).toMatchObject({
      fileName: "transfer_confidential_2_2.key",
    });
    prover.terminate();
  });

  it.each([
    ["another key's path", `${proveBase}/transfer_confidential_1_2`],
    ["the indexed route", `${endpoint}/indexed`],
    ["the status route", `${proveBase}/status?jobId=1`],
  ])("refuses %s without proving or forwarding the witness", async (_, input) => {
    const { prover, fetch } = await fixture();
    const response = await prover.createFetch()(input, { method: "POST", body });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "wasm_invalid_request" });
    expect(fetch).not.toHaveBeenCalled();
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
    expect(fetch).not.toHaveBeenCalled();
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
    expect(fetch).toHaveBeenCalledTimes(source === "cached" ? 0 : 1);
    expect(current().requests.some((request) => request.kind === "loadKey")).toBe(false);
    prover.terminate();
  });
});

describe("raw proving-key cache", () => {
  const pinnedUrl = "/keys/transfer_confidential_2_2.key";
  const rawUrl = `${pinnedUrl}?zolana-key=raw`;

  function memoryCache() {
    const entries = new Map<string, Response>();
    const cache = {
      entries,
      match: vi.fn(async (url: string) => entries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        entries.set(url, response);
      }),
      delete: vi.fn(async (url: string) => entries.delete(url)),
    };
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    return cache;
  }
  async function hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function loadKeyRequest(index = 0): Extract<WorkerRequest, { kind: "loadKey" }> {
    const found = current().requests.filter((value) => value.kind === "loadKey")[index];
    if (found === undefined) throw new Error("missing loadKey");
    return found as Extract<WorkerRequest, { kind: "loadKey" }>;
  }
  const keyDownloads = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls.filter(([input]) => String(input).endsWith(".key")).length;

  beforeEach(() => {
    TestWorker.rawKeyFormat = "raw-test";
  });

  it("keeps the bridge's raw key in place of the pinned file and loads it next time", async () => {
    const cache = memoryCache();
    const first = await fixture();
    await first.prover.proveRequest(body);
    const pinned = loadKeyRequest();
    expect(pinned).toMatchObject({ sha256: await hex(key), exportRaw: true });
    expect(new Uint8Array(pinned.key)).toEqual(key);
    expect([...cache.entries.keys()]).toEqual([rawUrl]);
    const stored = cache.entries.get(rawUrl)!;
    expect(stored.headers.get("x-zolana-pinned-sha256")).toBe(await hex(key));
    expect(stored.headers.get("x-zolana-raw-format")).toBe("raw-test");
    expect(stored.headers.get("x-zolana-raw-sha256")).toBe(await hex(rawKey));
    first.prover.terminate();

    const steps: Measurement[] = [];
    const second = await fixture((step) => steps.push(step));
    await second.prover.proveRequest(body);
    expect(keyDownloads(second.fetch)).toBe(0);
    const raw = loadKeyRequest();
    expect(raw).toMatchObject({ sha256: await hex(key), exportRaw: false });
    expect(new Uint8Array(raw.key)).toEqual(rawKey);
    expect(steps.find((step) => step.step === "key-fetch")?.note).toContain("raw-key cache");
    second.prover.terminate();
  });

  it.each(["pinned key", "format", "digest"] as const)(
    "rebuilds a raw entry with a different %s from the pinned key",
    async (mismatch) => {
      const cache = memoryCache();
      cache.entries.set(
        rawUrl,
        new Response(rawKey, {
          headers: {
            "x-zolana-pinned-sha256": mismatch === "pinned key" ? "0".repeat(64) : await hex(key),
            "x-zolana-raw-format": mismatch === "format" ? "raw-older" : "raw-test",
            "x-zolana-raw-sha256": mismatch === "digest" ? "0".repeat(64) : await hex(rawKey),
          },
        }),
      );
      const { prover, fetch } = await fixture();
      await prover.proveRequest(body);
      expect(keyDownloads(fetch)).toBe(1);
      expect(loadKeyRequest()).toMatchObject({ exportRaw: true });
      expect(new Uint8Array(loadKeyRequest().key)).toEqual(key);
      expect(cache.entries.get(rawUrl)?.headers.get("x-zolana-raw-format")).toBe("raw-test");
      expect(cache.entries.get(rawUrl)?.headers.get("x-zolana-pinned-sha256")).toBe(
        await hex(key),
      );
      prover.terminate();
    },
  );

  it("falls back to the pinned key when the bridge rejects a cached raw key", async () => {
    const cache = memoryCache();
    const seed = await fixture();
    await seed.prover.proveRequest(body);
    seed.prover.terminate();
    TestWorker.rejectRaw = true;

    const { prover, fetch } = await fixture();
    await expect(prover.proveRequest(body)).resolves.toHaveProperty("proof");
    expect(new Uint8Array(loadKeyRequest(0).key)).toEqual(rawKey);
    expect(new Uint8Array(loadKeyRequest(1).key)).toEqual(key);
    expect(loadKeyRequest(1).exportRaw).toBe(true);
    expect(keyDownloads(fetch)).toBe(1);
    expect(cache.entries.has(rawUrl)).toBe(true);
    prover.terminate();
  });

  it("does not ask for a raw key without a cache or from a bridge that has none", async () => {
    const { prover } = await fixture();
    await prover.proveRequest(body);
    expect(loadKeyRequest().exportRaw).toBe(false);
    prover.terminate();

    memoryCache();
    TestWorker.rawKeyFormat = undefined;
    const older = await fixture();
    await older.prover.proveRequest(body);
    expect(loadKeyRequest().exportRaw).toBe(false);
    older.prover.terminate();
  });
});

describe("key cache per key set", () => {
  function storage(names: readonly string[]) {
    const cache = {
      match: vi.fn(async () => undefined),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => true),
    };
    const caches = {
      open: vi.fn(async (_name: string) => cache),
      keys: vi.fn(async () => names),
      delete: vi.fn(async (_name: string) => true),
    };
    vi.stubGlobal("caches", caches);
    return caches;
  }

  it("opens this key set's store and deletes other key sets' stores once", async () => {
    const caches = storage([
      "zolana-proving-keys",
      `zolana-proving-keys-${KEY_SET}`,
      "zolana-proving-keys-0123456789abcdef",
      "app-assets",
    ]);
    const { prover } = await fixture();
    await prover.proveRequest(body);
    await prover.proveRequest(
      JSON.stringify({ circuitType: "transfer-confidential", nInputs: 1, nOutputs: 2 }),
    );
    expect(caches.open.mock.calls.map(([name]) => name)).toEqual([
      `zolana-proving-keys-${KEY_SET}`,
      `zolana-proving-keys-${KEY_SET}`,
    ]);
    expect(caches.keys).toHaveBeenCalledTimes(1);
    expect(caches.delete.mock.calls.map(([name]) => name)).toEqual([
      "zolana-proving-keys",
      "zolana-proving-keys-0123456789abcdef",
    ]);
    prover.terminate();
  });

  it("asks for persistent storage only when the caller opts in", async () => {
    storage([]);
    const persist = vi.fn(async () => true);
    vi.stubGlobal("navigator", { storage: { persist } });
    const plain = await fixture();
    await plain.prover.proveRequest(body);
    plain.prover.terminate();
    expect(persist).not.toHaveBeenCalled();

    const opted = await fixture(() => {}, { persistStorage: true });
    await opted.prover.proveRequest(body);
    await opted.prover.proveRequest(body);
    opted.prover.terminate();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe("prefetch and key progress", () => {
  const twoByTwo = TRANSFER_SHAPES.find((shape) => shape.label === "2x2")!;
  const oneByTwo = TRANSFER_SHAPES.find((shape) => shape.label === "1x2")!;

  function memoryCache() {
    const entries = new Map<string, Response>();
    const cache = {
      match: async (url: string) => entries.get(url)?.clone(),
      put: async (url: string, response: Response) => {
        entries.set(url, response);
      },
      delete: async (url: string) => entries.delete(url),
    };
    vi.stubGlobal("caches", { open: async () => cache, keys: async () => [] });
    return entries;
  }
  const loadedFiles = () =>
    current()
      .requests.filter((request) => request.kind === "loadKey")
      .map((request) => (request as Extract<WorkerRequest, { kind: "loadKey" }>).fileName);

  beforeEach(() => {
    TestWorker.rawKeyFormat = "raw-test";
  });

  it("decodes each shape once and skips shapes whose raw form is kept", async () => {
    const entries = memoryCache();
    const first = await fixture();
    await first.prover.prefetch({ shapes: [oneByTwo, twoByTwo] });
    expect(loadedFiles()).toEqual([oneByTwo.keyFile, twoByTwo.keyFile]);
    expect([...entries.keys()].filter((url) => url.endsWith("?zolana-key=raw"))).toHaveLength(2);
    first.prover.terminate();

    const second = await fixture();
    await second.prover.prefetch({ shapes: [oneByTwo, twoByTwo] });
    expect(loadedFiles()).toEqual([]);
    expect(second.fetch).not.toHaveBeenCalled();
    second.prover.terminate();
  });

  it("runs a proof requested meanwhile before the remaining shapes", async () => {
    memoryCache();
    const { prover } = await fixture();
    await prover.start();
    current().hold = "loadKey";
    const prefetching = prover.prefetch({ shapes: [oneByTwo, twoByTwo] });
    await vi.waitFor(() => expect(loadedFiles()).toEqual([oneByTwo.keyFile]));
    const proving = prover.proveRequest(body);
    current().hold = undefined;
    current().reply(request(current(), "loadKey"));
    await Promise.all([prefetching, proving]);
    expect(current().requests.map((value) => value.kind)).toEqual([
      "init",
      "loadKey",
      "loadKey",
      "prove",
      "verify",
    ]);
    expect(loadedFiles()).toEqual([oneByTwo.keyFile, twoByTwo.keyFile]);
    prover.terminate();
  });

  it("reports download progress up to the pinned size, then decode", async () => {
    memoryCache();
    const all: KeyProgress[] = [];
    const prefetched: KeyProgress[] = [];
    const { prover } = await fixture(() => {}, { onKeyProgress: (update) => all.push(update) });
    await prover.prefetch({ shapes: [twoByTwo], onProgress: (update) => prefetched.push(update) });
    const expected = [
      { keyFile: twoByTwo.keyFile, stage: "download", loaded: 3, total: 3 },
      { keyFile: twoByTwo.keyFile, stage: "decode", loaded: 3, total: 3 },
    ];
    expect(all).toEqual(expected);
    expect(prefetched).toEqual(expected);
    prover.terminate();
  });

  it("stops reading a key body larger than the pinned key", async () => {
    const { prover, fetch } = await fixture(() => {}, { onKeyProgress: () => {} });
    fetch.mockImplementation(async () => new Response(new Uint8Array([1, 2, 3, 4, 5])));
    await expect(prover.proveRequest(body)).rejects.toMatchObject({
      code: "wasm_key_digest_mismatch",
    });
    expect(loadedFiles()).toEqual([]);
    prover.terminate();
  });
});
