import { describe, expect, it, vi } from "vitest";
import { KEY_BASE_URL, KEY_SET } from "../src/key-digests.js";
import { WasmProver, type WorkerRequest } from "../src/wasm-prover.js";
import type { Measurement } from "../src/measurement.js";
import {
  TestWorker,
  body,
  current,
  endpoint,
  failure,
  fixture,
  key,
  proverTestHooks,
  rawKey,
  request,
} from "./support/prover.js";
import { gnarkKeySha256 } from "./support/digests.js";

vi.mock("../src/key-digests.js", async (importOriginal) =>
  (await import("./support/digests.js")).threeByteKeyDigests(importOriginal),
);
proverTestHooks();

describe("best-effort proving-key cache", () => {
  function cacheFixture() {
    const cache = {
      match: vi.fn(
        async (_url: string): Promise<Response | undefined> =>
          new Response(new Uint8Array([9, 9, 9])),
      ),
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
      expect(fetch.mock.calls.filter(([input]) => String(input).endsWith(".zopro"))).toHaveLength(1);
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
    const pinnedUrl = "/keys/transfer_confidential_2_2.zopro";
    cache.match.mockImplementation(async (url) =>
      url === pinnedUrl ? new Response(key) : undefined,
    );
    await prover.proveRequest(body);
    expect(fetch).not.toHaveBeenCalled();
    // The runtime's raw form then takes the pinned file's place.
    expect(cache.put).toHaveBeenCalledExactlyOnceWith(
      `${pinnedUrl}?zolana-key=raw`,
      expect.any(Response),
    );
    expect(cache.delete).toHaveBeenCalledExactlyOnceWith(pinnedUrl);
    prover.terminate();
  });

  it("rejects tampered network bytes even when stale-cache eviction fails", async () => {
    const { prover, fetch } = await fixture();
    const { cache } = cacheFixture();
    cache.delete.mockRejectedValue(new DOMException("denied", "SecurityError"));
    const normal = fetch.getMockImplementation()!;
    fetch.mockImplementation((input, init) =>
      String(input).endsWith(".zopro")
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
  const pinnedUrl = "/keys/transfer_confidential_2_2.zopro";
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
    fetch.mock.calls.filter(([input]) => String(input).endsWith(".zopro")).length;

  it("keeps the runtime's raw key in place of the pinned file and loads it next time", async () => {
    const cache = memoryCache();
    const first = await fixture();
    await first.prover.proveRequest(body);
    const pinned = loadKeyRequest();
    expect(pinned).toMatchObject({ keySha256: gnarkKeySha256, exportRaw: true });
    expect(new Uint8Array(pinned.key)).toEqual(key);
    expect([...cache.entries.keys()]).toEqual([rawUrl]);
    const stored = cache.entries.get(rawUrl)!;
    expect(stored.headers.get("x-zolana-pinned-sha256")).toBe(await hex(key));
    expect(stored.headers.get("x-zolana-raw-format")).toBe("raw-test");
    expect(stored.headers.get("x-zolana-raw-size")).toBe(String(rawKey.length));
    first.prover.terminate();

    const steps: Measurement[] = [];
    const second = await fixture((step) => steps.push(step));
    await second.prover.proveRequest(body);
    expect(keyDownloads(second.fetch)).toBe(0);
    const raw = loadKeyRequest();
    expect(raw).toMatchObject({ keySha256: gnarkKeySha256, exportRaw: false });
    expect(new Uint8Array(raw.key)).toEqual(rawKey);
    expect(steps.find((step) => step.step === "key-fetch")?.note).toContain("raw-key cache");
    second.prover.terminate();
  });

  it.each(["pinned key", "format", "size"] as const)(
    "rebuilds a raw entry with a different %s from the pinned key",
    async (mismatch) => {
      const cache = memoryCache();
      cache.entries.set(
        rawUrl,
        new Response(rawKey, {
          headers: {
            "x-zolana-pinned-sha256": mismatch === "pinned key" ? "0".repeat(64) : await hex(key),
            "x-zolana-raw-format": mismatch === "format" ? "raw-older" : "raw-test",
            "x-zolana-raw-size": String(mismatch === "size" ? rawKey.length + 1 : rawKey.length),
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

  it("falls back to the pinned key when the runtime rejects a cached raw key", async () => {
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

  it("does not ask for a raw key without a cache", async () => {
    const { prover } = await fixture();
    await prover.proveRequest(body);
    expect(loadKeyRequest().exportRaw).toBe(false);
    prover.terminate();
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
    expect(caches.open.mock.calls.map(([name]) => name)).toEqual([`zolana-proving-keys-${KEY_SET}`]);
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

describe("key source", () => {
  it("fetches keys from the pinned CDN folder unless keyBaseUrl is set", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(key));
    const prover = new WasmProver({
      proverUrl: "http://localhost:3001",
      fetch,
    });
    await prover.proveRequest(body);
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      `${KEY_BASE_URL}transfer_confidential_2_2.zopro`,
    ]);
    expect(KEY_BASE_URL).toMatch(/^https:\/\/.+\/3a1c88f90f609eb1\/$/u);
    prover.terminate();
  });
});
