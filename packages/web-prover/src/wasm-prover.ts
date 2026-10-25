/**
 * Local proving in the browser, wired into the SDK without patching it.
 *
 * `ProverClient` takes an injectable `fetch`, and the runtime's `prove`
 * accepts and returns exactly the JSON a `POST /prove/<key>` exchange uses (it mirrors
 * `server.processProofSync`). So the whole integration is a `fetch` that
 * recognizes the prover URL and answers it from wasm instead of the network.
 * Everything else -- indexer calls, Solana RPC -- falls through untouched.
 *
 * The runtime is zopro-zolana built for the browser: Zolana's request and
 * proof formats, gnark's keys repacked as zopro key files.
 */

import { abortable } from "./abortable.js";
import type { KeyProgress, Measurement } from "./measurement.js";
import { WasmProverError, workerError } from "./errors.js";
export { WasmProverError } from "./errors.js";
import { KeyStore, type KeyBytes, type KeyDigest, type ProvingKeyStatus } from "./key-store.js";
import { automaticProvingThreads } from "./proving-threads.js";
import { createProverFetch } from "./prover-fetch.js";
import { isWideMerge, proofRequestShape } from "./proof-requests.js";
import { type ShapeKey } from "./shapes.js";

/** Messages the worker understands. Mirrored by `prover.worker.ts`. */
export type WorkerRequest =
  | Readonly<{ id: number; kind: "init"; threads: number }>
  | Readonly<{
      id: number;
      kind: "loadKey";
      fileName: string;
      /** The pinned key file, or the raw form of an earlier load. */
      key: ArrayBuffer;
      /** The gnark proving key's sha256 the key file was built from, which proofs report. */
      keySha256: string;
      /** Ask for the raw form back, to cache. */
      exportRaw: boolean;
    }>
  | Readonly<{ id: number; kind: "prove"; body: string }>
  | Readonly<{ id: number; kind: "loadedKeys" }>;

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
  /**
   * Threads of the proving pool (one or more; omit to choose automatically), or
   * `0` for the single-thread runtime without SharedArrayBuffer.
   */
  readonly threads?: number;
  /**
   * Where proving keys are fetched from. Omit it to use the pinned key set on
   * the Zolana CDN, which serves them with CORS; set it to self-host or mirror
   * them, as `zolana-prover-keys` installs.
   */
  readonly keyBaseUrl?: string;
  /** The prover URL handed to the SDK; requests to it are intercepted. */
  readonly proverUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  /** Override worker construction for tests or a custom bundler. */
  readonly workerFactory?: () => Worker;
  /** Called for each timed worker operation so the UI can chart it. */
  readonly onMeasurement?: (measurement: Measurement) => void;
  /** Called as each proving key downloads and when the worker starts decoding it. */
  readonly onKeyProgress?: (progress: KeyProgress) => void;
  /**
   * Ask the browser to keep cached keys under storage pressure
   * (`navigator.storage.persist()`). Firefox shows the user a prompt for it.
   */
  readonly persistStorage?: boolean;
}

/**
 * Owns the worker and the queue of its work; the keys live in a `KeyStore`
 * and the SDK's `fetch` comes from `createProverFetch`.
 */
export class WasmProver {
  #worker: Worker | undefined;
  #factory: (() => Worker) | undefined;
  #initialization: Promise<void> | undefined;
  #lifetime = new AbortController();
  /** The encoding of the raw keys the started worker's runtime exports and accepts. */
  #rawKeyFormat = "";
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
      // terminating the runtime is the only way to stop its synchronous work.
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
  /** The key the worker holds; one deserialized key is resident at a time. */
  readonly #loaded = new Set<string>();
  readonly #options: WasmProverOptions;
  readonly #store: KeyStore;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: WasmProverOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#factory = options.workerFactory ?? createProverWorker;
    this.#store = new KeyStore({
      fetch: this.#fetch,
      ...(options.keyBaseUrl === undefined ? {} : { keyBaseUrl: options.keyBaseUrl }),
      ...(options.persistStorage === undefined ? {} : { persistStorage: options.persistStorage }),
    });
  }

  /**
   * Starts the worker and instantiates the runtime.
   *
   * The runtime must run in a worker: a proof blocks its thread for seconds,
   * so on the main thread it would freeze the page for the whole proof.
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
      threads: this.#options.threads ?? automaticProvingThreads(),
    })
      .then((ready) => {
        if (this.#worker !== worker) throw new WasmProverError("wasm_worker_terminated");
        const value = ready.value;
        if (
          typeof value !== "object" ||
          value === null ||
          !("threads" in value) ||
          typeof value.threads !== "number" ||
          !("rawKeyFormat" in value) ||
          typeof value.rawKeyFormat !== "string"
        ) {
          throw new WasmProverError("wasm_invalid_response");
        }
        this.#threads = value.threads;
        this.#rawKeyFormat = value.rawKeyFormat;
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

  /**
   * Downloads, checks and decodes `shapes` ahead of the proofs that need them, so
   * a first proof doesn't wait seconds for its key. With the Cache API each
   * shape's decoded form is kept and later loads take a fraction of a second;
   * shapes already kept are skipped. Each shape is queued on its own, so a proof
   * requested meanwhile runs after the shape in progress. Aborting skips the
   * remaining shapes; aborting the one in progress restarts the worker. Without
   * the Cache API only the last shape stays loaded.
   */
  async prefetch(
    options: Readonly<{
      shapes: readonly ShapeKey[];
      signal?: AbortSignal;
      onProgress?: (progress: KeyProgress) => void;
    }>,
  ): Promise<void> {
    for (const shape of options.shapes) {
      await this.#enqueue(async (active) => {
        await this.#ensureStarted(active);
        if (!(await this.#store.rawKept(shape, this.#rawKeyFormat, active)))
          await this.#loadKey(shape, active, options.onProgress);
      }, options.signal);
    }
  }

  /**
   * Every key the prover can load, smallest first, with what the browser keeps of
   * it. Reads the cache only: the worker need not be running, and a prefetch or
   * proof may be downloading meanwhile.
   */
  provingKeys(signal?: AbortSignal): Promise<readonly ProvingKeyStatus[]> {
    return this.#store.status(signal ?? new AbortController().signal);
  }

  /**
   * Removes the kept keys, their decoded forms and interrupted downloads. A
   * prefetch or proof in progress finishes first; the key the worker has loaded
   * stays loaded.
   */
  async clearKeys(signal?: AbortSignal): Promise<void> {
    await this.#enqueue((active) => this.#store.clear(active), signal);
  }

  async #loadKey(
    shape: ShapeKey,
    signal: AbortSignal,
    onProgress?: (progress: KeyProgress) => void,
  ): Promise<void> {
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

    const expected = this.#store.digest(shape);
    const progress = (stage: KeyProgress["stage"], loaded: number) => {
      const update = { keyFile: shape.keyFile, stage, loaded, total: expected.size };
      this.#options.onKeyProgress?.(update);
      onProgress?.(update);
    };
    const downloaded =
      this.#options.onKeyProgress === undefined && onProgress === undefined
        ? undefined
        : (loaded: number) => progress("download", loaded);
    const started = performance.now();
    let key = await this.#store.load(shape, this.#rawKeyFormat, signal, downloaded);
    signal.throwIfAborted();
    this.#options.onMeasurement?.({
      step: "key-fetch",
      ms: performance.now() - started,
      bytes: key.bytes.byteLength,
      note: `${shape.keyFile} from ${key.raw ? "the raw-key cache" : key.source}`,
    });
    signal.throwIfAborted();

    this.#loaded.clear();
    progress("decode", expected.size);
    let response: WorkerResponse;
    try {
      response = await this.#installKey(shape, key, expected);
    } catch (error) {
      if (!key.raw) throw error;
      // A raw entry the runtime no longer accepts is rebuilt from the pinned key.
      signal.throwIfAborted();
      key = await this.#store.reload(shape, signal, downloaded);
      signal.throwIfAborted();
      response = await this.#installKey(shape, key, expected);
    }
    signal.throwIfAborted();
    const info = response.value as
      | Readonly<{ key?: string; inputs?: number; outputs?: number; raw?: unknown }>
      | undefined;
    this.#options.onMeasurement?.({
      step: "key-load",
      ms: response.ms,
      bytes: shape.keyBytes,
      note:
        info?.key === undefined
          ? shape.keyFile
          : `${shape.keyFile} as ${info.key} ${String(info.inputs)}x${String(info.outputs)}`,
    });
    signal.throwIfAborted();
    const raw = info?.raw;
    if (key.cacheable && raw instanceof Uint8Array && raw.buffer instanceof ArrayBuffer)
      await this.#store.keepRaw(
        shape,
        this.#rawKeyFormat,
        new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
        signal,
      );
    this.#loaded.clear();
    this.#loaded.add(shape.keyFile);
  }

  #installKey(shape: ShapeKey, key: KeyBytes, expected: KeyDigest): Promise<WorkerResponse> {
    return this.#call(
      {
        kind: "loadKey",
        fileName: shape.keyFile,
        key: key.bytes,
        keySha256: expected.keySha256,
        // The runtime's raw form, to keep in place of the pinned file.
        exportRaw: !key.raw && key.cacheable,
      },
      [key.bytes],
    );
  }

  /**
   * A `fetch` for `ZolanaClientConfig.fetch`. Proof requests to `/prove/<key>`
   * are answered by the runtime, other paths below `/prove` are refused, and
   * everything else is delegated, so one shim covers the client.
   */
  createFetch(): typeof globalThis.fetch {
    return createProverFetch({
      proverUrl: this.#options.proverUrl,
      fetch: this.#fetch,
      ...(this.#options.onMeasurement === undefined
        ? {}
        : { onMeasurement: this.#options.onMeasurement }),
      prove: (body, signal) => this.proveRequest(body, signal),
    });
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
      if (shape === undefined) {
        throw new WasmProverError(isWideMerge(body) ? "wasm_merge_too_wide" : "wasm_invalid_request");
      }
      await this.#loadKey(shape, active);
      active.throwIfAborted();
      // The runtime verifies the proof before it returns it.
      const response = await this.#call({ kind: "prove", body });
      const value = response.value;
      if (
        typeof value !== "object" ||
        value === null ||
        !("proof" in value) ||
        typeof value.proof !== "string" ||
        !("verifyMs" in value) ||
        typeof value.verifyMs !== "number"
      )
        throw new WasmProverError("wasm_invalid_response");
      active.throwIfAborted();
      this.#options.onMeasurement?.({
        step: "transfer-prove",
        ms: response.ms,
        note:
          this.#threads === 0
            ? "zopro proof, single thread; locally verified"
            : `zopro proof, ${String(this.#threads)} threads; locally verified`,
      });
      return { proof: value.proof, proveMs: response.ms - value.verifyMs, verifyMs: value.verifyMs };
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
    if (!response.ok) throw workerError(request.kind, response.error);
    return response;
  }
}

function createProverWorker(): Worker {
  // The compiled worker, which the app's bundler emits with the runtime beside it.
  return new Worker(new URL("./prover.worker.js", import.meta.url), {
    type: "module",
    name: "zolana-web-prover",
  });
}
