import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZolanaWebProver } from "../src/index.js";
import { WasmProver, type WorkerRequest, type WorkerFatal } from "../src/wasm-prover.js";
import type { KeyProgress, Measurement } from "../src/measurement.js";
import { TRANSFER_SHAPES } from "../src/shapes.js";
import {
  TestWorker,
  body,
  current,
  endpoint,
  factory,
  failure,
  fixture,
  key,
  proveBase,
  proverTestHooks,
  request,
} from "./support/prover.js";

vi.mock("../src/key-digests.js", async (importOriginal) =>
  (await import("./support/digests.js")).threeByteKeyDigests(importOriginal),
);
proverTestHooks();

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

  it("rejects a worker whose bridge reports no raw key format", async () => {
    const { prover } = await fixture();
    TestWorker.rawKeyFormat = undefined;
    await expect(prover.start(factory)).rejects.toMatchObject({ code: "wasm_invalid_response" });
    expect(current().terminated).toBe(true);
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
