/**
 * Local proving in the browser, wired into the SDK without patching it.
 *
 * `ProverClient` takes an injectable `fetch`, and the wasm module's `prove`
 * accepts and returns exactly the JSON a `POST /prove` exchange uses (it mirrors
 * `server.processProofSync`). So the whole integration is a `fetch` that
 * recognizes the prover URL and answers it from wasm instead of the network.
 * Everything else -- indexer calls, Solana RPC -- falls through untouched.
 *
 * Mopro supplies the threaded Rust arithmetic kernel; Zolana retains its
 * native witness and proof formats.
 */

import { abortable } from "./abortable.js";
import type { Measurement } from "./measurement.js";
import { operationError, WasmProverError } from "./errors.js";
export { WasmProverError } from "./errors.js";
import { automaticProvingThreads } from "./proving-threads.js";
import { proofRequestShape } from "./proof-requests.js";
import { type ShapeKey } from "./shapes.js";

/** Messages the worker understands. Mirrored by `prover.worker.ts`. */
export type WorkerRequest =
  | Readonly<{ id: number; kind: "init"; wasmUrl: string; threads: number }>
  | Readonly<{ id: number; kind: "loadKey"; fileName: string; key: ArrayBuffer }>
  | Readonly<{ id: number; kind: "prove"; body: string }>
  | Readonly<{ id: number; kind: "loadedKeys" }>
  | Readonly<{ id: number; kind: "verify"; body: string; proof: string }>;

/**
 * `Omit` over a union collapses to the union's common keys, which would erase
 * every request's payload. Distribute it so each member keeps its own fields.
 */
type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;

export type WorkerFatal = Readonly<{ fatal: true; error: string }>;

export type WorkerResponse = Readonly<{
  id: number;
  ok: boolean;
  /** Present when ok; shape depends on the request kind. */
  value?: unknown;
  error?: string;
  /** Time spent inside the worker, so the page reports proving cost honestly. */
  ms: number;
}>;

export interface WasmProverOptions {
  /** URL of `zolana-prover.wasm` (built by `build_prover_wasm.sh`). */
  readonly wasmUrl: string;
  /** Omit to choose automatically; zero selects the original Go prover. */
  readonly threads?: number;
  /** Base URL proving keys are fetched from, e.g. the CloudFront prefix. */
  readonly keyBaseUrl: string;
  /** The prover URL handed to the SDK; requests to it are intercepted. */
  readonly proverUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Override worker construction for tests or a custom bundler. */
  readonly workerFactory?: () => Worker;
  /** Called for each timed worker operation so the UI can chart it. */
  readonly onMeasurement?: (measurement: Measurement) => void;
}

/**
 * Owns the worker, the key cache, and the `fetch` shim.
 *
 * Proving keys are cached in the Cache API rather than memory: they are 8-37 MB
 * each and immutable (the lockfile pins their sha256 and the CloudFront prefix
 * is version-hashed), so re-downloading one per page load is pure waste.
 */
export class WasmProver {
  #worker: Worker | undefined;
  #factory: (() => Worker) | undefined;
  #initialization: Promise<void> | undefined;
  #lifetime = new AbortController();
  #manifest: ReadonlyMap<string, KeyDigest> | undefined;
  #nextId = 1;
  #queue: Promise<unknown> = Promise.resolve();
  #threads = 0;
  get threads(): number {
    return this.#threads;
  }

  #enqueue<T>(operation: (signal: AbortSignal) => Promise<T>, external?: AbortSignal): Promise<T> {
    const lifetime = this.#lifetime.signal;
    const signal = external === undefined ? lifetime : AbortSignal.any([lifetime, external]);
    const next = this.#queue.then(async () => {
      signal.throwIfAborted();
      // A queued cancellation must not interrupt another request. Once active,
      // terminating the runtime is the only way to stop synchronous Go/Rust work.
      const abort = () => {
        if (!lifetime.aborted) this.#fail(signal.reason);
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        return await abortable(operation(signal), signal);
      } finally {
        signal.removeEventListener("abort", abort);
      }
    });
    this.#queue = next.catch(() => {});
    return abortable(next, signal);
  }
  readonly #pending = new Map<
    number,
    Readonly<{ resolve: (value: WorkerResponse) => void; reject: (error: unknown) => void }>
  >();
  readonly #loaded = new Set<string>();
  readonly #options: WasmProverOptions;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: WasmProverOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#factory = options.workerFactory ?? createProverWorker;
  }

  /**
   * Starts the worker and instantiates the module.
   *
   * The module must run in a worker: Go's js/wasm runtime shares the thread it
   * is instantiated on, and `groth16.Prove` blocks for seconds, so on the main
   * thread it would freeze the page for the whole proof.
   */
  start(source: Worker | (() => Worker) | undefined = this.#factory): Promise<void> {
    if (this.#initialization !== undefined) return this.#initialization;
    if (source === undefined) {
      return Promise.reject(new WasmProverError("wasm_worker_not_started"));
    }
    this.#factory = typeof source === "function" ? source : undefined;
    let worker: Worker;
    try {
      worker = typeof source === "function" ? source() : source;
    } catch {
      return Promise.reject(new WasmProverError("wasm_init_failed"));
    }
    this.#worker = worker;
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse | WorkerFatal>) => {
      if (this.#worker !== worker) return;
      const response = event.data;
      if ("fatal" in response) {
        this.#fail(new WasmProverError("wasm_worker_failed"));
        return;
      }
      const pending = this.#pending.get(response.id);
      if (pending === undefined) return;
      this.#pending.delete(response.id);
      pending.resolve(response);
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      if (this.#worker !== worker) return;
      this.#fail(new WasmProverError("wasm_worker_failed"));
    });
    worker.addEventListener("messageerror", () => {
      if (this.#worker === worker) this.#fail(new WasmProverError("wasm_invalid_response"));
    });
    const initialization = this.#call({
      kind: "init",
      wasmUrl: this.#options.wasmUrl,
      threads: this.#options.threads ?? automaticProvingThreads(),
    })
      .then((ready) => {
        if (this.#worker !== worker) throw new WasmProverError("wasm_worker_terminated");
        const value = ready.value;
        if (
          typeof value !== "object" ||
          value === null ||
          !("threads" in value) ||
          typeof value.threads !== "number"
        ) {
          throw new WasmProverError("wasm_invalid_response");
        }
        this.#threads = value.threads;
      })
      .catch((error: unknown) => {
        if (this.#worker === worker || this.#initialization === initialization) this.#fail(error);
        throw error;
      });
    this.#initialization = initialization;
    return initialization;
  }

  async #ensureStarted(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (this.#initialization !== undefined) {
      await abortable(this.#initialization, signal);
    } else if (this.#factory !== undefined) {
      await abortable(this.start(this.#factory), signal);
    } else {
      throw new WasmProverError("wasm_worker_not_started");
    }
    signal.throwIfAborted();
  }

  /** Downloads (or reads from cache) and deserializes one shape's proving key. */
  async ensureKey(shape: ShapeKey, signal?: AbortSignal): Promise<void> {
    return this.#enqueue((active) => this.#loadKey(shape, active), signal);
  }

  async #loadKey(shape: ShapeKey, signal: AbortSignal): Promise<void> {
    await this.#ensureStarted(signal);
    if (this.#loaded.has(shape.keyFile)) {
      // Reported rather than returned silently: a second sweep would otherwise
      // show a passing run with no steps, which reads as a lost measurement.
      this.#options.onMeasurement?.({
        step: "key-load",
        ms: 0,
        bytes: shape.keyBytes,
        note: `${shape.keyFile} already deserialized in this instance`,
      });
      return;
    }

    const url = `${this.#options.keyBaseUrl.replace(/\/+$/u, "")}/${shape.keyFile}`;
    const started = performance.now();
    const key = await this.#fetchKey(url, shape, signal);
    signal.throwIfAborted();
    this.#options.onMeasurement?.({
      step: "key-fetch",
      ms: performance.now() - started,
      bytes: key.byteLength,
      note: shape.keyFile,
    });
    signal.throwIfAborted();

    this.#loaded.clear();
    const response = await this.#call({ kind: "loadKey", fileName: shape.keyFile, key }, [key]);
    signal.throwIfAborted();
    const info = response.value as
      | Readonly<{ key?: string; nbPublic?: number; nbSecret?: number }>
      | undefined;
    this.#options.onMeasurement?.({
      step: "key-load",
      ms: response.ms,
      bytes: shape.keyBytes,
      // The constraint system's variable count is what a witness-size mismatch is
      // measured against, so it belongs next to the key that supplied it.
      note:
        info?.nbPublic === undefined
          ? shape.keyFile
          : `${shape.keyFile} as ${String(info.key)} nbPublic=${String(info.nbPublic)} nbSecret=${String(info.nbSecret)}`,
    });
    signal.throwIfAborted();
    this.#loaded.clear();
    this.#loaded.add(shape.keyFile);
  }

  /**
   * The digests `just poc-keys` copied out of `proving-keys.lock`.
   *
   * Fetched once and required: a key rotation changes every size and digest, and
   * validating against anything other than the lockfile lets a stale key through.
   * That is not a theoretical failure -- a same-shape key from an older rotation
   * deserializes cleanly and only surfaces as `groth16.Prove` reporting a witness
   * size mismatch, which reads as a malformed request rather than a bad key.
   */
  async #keyManifest(signal: AbortSignal): Promise<ReadonlyMap<string, KeyDigest>> {
    if (this.#manifest !== undefined) return this.#manifest;
    const url = `${this.#options.keyBaseUrl.replace(/\/+$/u, "")}/manifest.json`;
    const response = await abortable(this.#fetch(url, { signal }), signal);
    if (!response.ok) throw new WasmProverError("wasm_key_manifest_error");
    let parsed: unknown;
    try {
      parsed = await abortable(response.json(), signal);
    } catch (error) {
      rethrowAbort(error, signal);
      throw new WasmProverError("wasm_key_manifest_error");
    }
    signal.throwIfAborted();
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      !Object.values(parsed).every(isKeyDigest)
    )
      throw new WasmProverError("wasm_key_manifest_error");
    this.#manifest = new Map(Object.entries(parsed) as [string, KeyDigest][]);
    return this.#manifest;
  }

  async #fetchKey(url: string, shape: ShapeKey, signal: AbortSignal): Promise<ArrayBuffer> {
    const manifest = await this.#keyManifest(signal);
    const expected = manifest.get(shape.keyFile);
    if (expected === undefined) {
      throw new WasmProverError("wasm_key_manifest_error");
    }

    const cacheName = "zolana-proving-keys";
    const cache = await optionalCache(() => globalThis.caches?.open(cacheName), signal);
    if (cache !== undefined) {
      const hit = await optionalCache(() => cache.match(url), signal);
      if (hit !== undefined) {
        const cached = await optionalCache(() => hit.arrayBuffer(), signal);
        if (cached !== undefined && (await abortable(matchesDigest(cached, expected), signal)))
          return cached;
        // Written before a rotation: same shape, different circuit. Evict rather
        // than prove against it.
        await optionalCache(() => cache.delete(url), signal);
      }
    }

    const response = await abortable(this.#fetch(url, { signal }), signal);
    if (!response.ok) {
      throw new WasmProverError("wasm_key_download_failed");
    }
    const bytes = await abortable(response.arrayBuffer(), signal);
    if (!(await abortable(matchesDigest(bytes, expected), signal))) {
      throw new WasmProverError("wasm_key_digest_mismatch");
    }
    if (cache !== undefined)
      await optionalCache(() => cache.put(url, new Response(bytes.slice(0))), signal);
    return bytes;
  }

  /**
   * A `fetch` for `ZolanaClientConfig.fetch`. Prover requests are answered from
   * wasm; everything else is delegated, so one shim covers the whole client.
   */
  createFetch(): typeof globalThis.fetch {
    const proverPath = new URL(this.#options.proverUrl);
    proverPath.pathname = `${proverPath.pathname.replace(/\/+$/u, "")}/prove`;
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = requestUrl(input);
      const isProve =
        url !== undefined &&
        url.origin === proverPath.origin &&
        url.pathname === proverPath.pathname;
      if (!isProve) return await this.#fetch(input as RequestInfo, init);

      const signal =
        init?.signal !== undefined
          ? (init.signal ?? undefined)
          : input instanceof Request
            ? input.signal
            : undefined;
      signal?.throwIfAborted();
      try {
        const body = await abortable(readBody(input, init), signal);
        if (body === undefined) throw new WasmProverError("wasm_invalid_request");
        const result = await this.proveRequest(body, signal);
        signal?.throwIfAborted();
        return new Response(result.proof, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        rethrowAbort(error, signal);
        return proverErrorResponse(error, this.#options.onMeasurement);
      }
    };
  }

  /**
   * Prove and verify one request locally, keeping key switching atomic.
   * Aborting queued work leaves the active request alone. Aborting active work
   * discards the runtime and rejects its other outstanding requests. A factory
   * supplied to start() lets a later request initialize a fresh worker.
   */
  async proveRequest(
    body: string,
    signal?: AbortSignal,
  ): Promise<{ proof: string; proveMs: number; verifyMs: number }> {
    return this.#enqueue(async (active) => {
      const shape = proofRequestShape(body);
      if (shape === undefined) throw new WasmProverError("wasm_invalid_request");
      await this.#loadKey(shape, active);
      active.throwIfAborted();
      const response = await this.#call({ kind: "prove", body });
      if (typeof response.value !== "string") throw new WasmProverError("wasm_invalid_response");
      const proof = response.value;
      active.throwIfAborted();
      const verified = await this.#call({ kind: "verify", body, proof });
      if (
        typeof verified.value !== "object" ||
        verified.value === null ||
        !("valid" in verified.value) ||
        verified.value.valid !== true
      ) {
        throw new WasmProverError("wasm_verify_failed");
      }
      active.throwIfAborted();
      this.#options.onMeasurement?.({
        step: "transfer-prove",
        ms: response.ms,
        note: `Mopro proof, ${String(this.#threads)} arithmetic workers; locally verified`,
      });
      return { proof, proveMs: response.ms, verifyMs: verified.ms };
    }, signal);
  }

  async loadedKeys(): Promise<readonly string[]> {
    return this.#enqueue(async (signal) => {
      await this.#ensureStarted(signal);
      const response = await this.#call({ kind: "loadedKeys" });
      const value = response.value;
      if (
        typeof value === "object" &&
        value !== null &&
        "keys" in value &&
        Array.isArray(value.keys)
      ) {
        return value.keys.map(String);
      }
      throw new WasmProverError("wasm_invalid_response");
    });
  }

  terminate(): void {
    this.#factory = undefined;
    this.#fail(new WasmProverError("wasm_worker_terminated"));
  }

  #fail(error: unknown): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#initialization = undefined;
    this.#threads = 0;
    this.#loaded.clear();
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
    const lifetime = this.#lifetime;
    this.#lifetime = new AbortController();
    this.#queue = Promise.resolve();
    lifetime.abort(error);
  }

  async #call(
    request: WithoutId<WorkerRequest>,
    transfer: readonly Transferable[] = [],
  ): Promise<WorkerResponse> {
    const worker = this.#worker;
    if (worker === undefined) {
      throw new WasmProverError("wasm_worker_not_started");
    }
    const id = this.#nextId++;
    const response = await new Promise<WorkerResponse>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        worker.postMessage({ ...request, id }, [...transfer]);
      } catch {
        this.#fail(new WasmProverError("wasm_worker_failed"));
      }
    });
    if (!response.ok) throw operationError(request.kind);
    return response;
  }
}

function createProverWorker(): Worker {
  return new Worker(new URL("./prover.worker.ts", import.meta.url), {
    type: "module",
    name: "zolana-web-prover",
  });
}

function requestUrl(input: RequestInfo | URL): URL | undefined {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return undefined;
  }
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request) return await input.clone().text();
  return undefined;
}

/** One entry of `keys/manifest.json`, copied from `proving-keys.lock`. */
export interface KeyDigest {
  readonly size: number;
  readonly sha256: string;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function matchesDigest(bytes: ArrayBuffer, expected: KeyDigest): Promise<boolean> {
  // Size first: it is free and rejects the common case (a dev server with no keys
  // staged answers 200 with its SPA fallback HTML) without hashing megabytes.
  if (bytes.byteLength !== expected.size) return false;
  return (await sha256Hex(bytes)) === expected.sha256;
}

/**
 * A 500 carrying the reason, so the SDK's prover error path handles it as a
 * server rejection rather than a retryable transport fault.
 */
function proverErrorResponse(
  error: unknown,
  onMeasurement?: (measurement: Measurement) => void,
): Response {
  const safe = new WasmProverError(error instanceof WasmProverError ? error.code : undefined);
  onMeasurement?.({ step: "transfer-prove", ms: 0, note: safe.code });
  return new Response(JSON.stringify({ code: safe.code, message: safe.message }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}

function isKeyDigest(value: unknown): value is KeyDigest {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    Number.isSafeInteger(value.size) &&
    Number(value.size) > 0 &&
    "sha256" in value &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(value.sha256)
  );
}

function rethrowAbort(error: unknown, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (error instanceof Error && error.name === "AbortError") throw error;
}

async function optionalCache<T>(
  operation: () => T | Promise<T>,
  signal: AbortSignal,
): Promise<T | undefined> {
  try {
    return await abortable(Promise.resolve().then(operation), signal);
  } catch (error) {
    rethrowAbort(error, signal);
    return undefined;
  }
}
