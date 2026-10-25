/// <reference lib="webworker" />
/**
 * Hosts the prover runtime off the main thread.
 *
 * The runtime is zopro-zolana built for the browser: one WebAssembly module
 * that loads a key, builds the witness, proves on a thread pool (and WebGPU
 * where the page has it) and verifies the proof before it returns it. A
 * proof takes seconds, so this is a worker. Every operation is timed here
 * rather than on the page so the reported proving cost excludes postMessage
 * and structured-clone overhead.
 *
 * `threads` greater than zero needs a cross-origin isolated page and starts
 * the Rayon pool. `threads: 0` loads the runtime built without shared memory,
 * which proves on this worker alone and needs no isolation: key files are
 * decompressed across ordinary workers (`key-decoders.ts`) instead.
 */

import type { WorkerRequest, WorkerResponse } from "./wasm-prover.js";
import { operationError, WasmProverError } from "./errors.js";
import { decodeKey } from "./key-decoders.js";
import {
  importSingleRuntime,
  importThreadedRuntime,
  type ProofValue,
  type Runtime,
  type ZolanaProver,
} from "./runtime.js";

let runtime: Runtime | undefined;
let pooled = false;
let activeThreads = 0;
let loaded: { fileName: string; prover: ZolanaProver } | undefined;

// Rayon's helpers wait for every thread to report ready, and a thread whose script
// the page refuses never does; a pool that has not started by then has failed.
const threadPoolTimeoutMs = 30_000;

/** Magic of a cached raw key (`zopro-raw-3`); those skip worker decompression. */
const rawKeyMagic = new TextEncoder().encode("zopro-raw3\0\0\0\0\0\0");

async function init(threads: number): Promise<void> {
  if (runtime !== undefined) return;
  if (!Number.isInteger(threads) || threads < 0 || threads > 64) {
    throw new Error("Threads must be an integer between 0 and 64");
  }
  if (threads > 0) {
    if (!globalThis.crossOriginIsolated)
      throw new Error(
        "Threaded proving requires cross-origin isolation. Use the Vite server with COOP/COEP headers, or set threads: 0.",
      );
    const module = await importThreadedRuntime();
    await module.default();
    await withTimeout(module.initThreadPool(threads), threadPoolTimeoutMs);
    if ("gpu" in navigator) await module.init_gpu();
    runtime = module;
    pooled = true;
    activeThreads = threads;
    return;
  }
  const module = await importSingleRuntime();
  await module.default();
  if ("gpu" in navigator) await module.init_gpu();
  runtime = module;
  pooled = false;
  activeThreads = 0;
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("the runtime's thread pool did not start")), ms);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}

function requireRuntime(): Runtime {
  if (runtime === undefined) throw new Error("the runtime is not initialized; send init first");
  return runtime;
}

function isRawKey(key: Uint8Array): boolean {
  if (key.byteLength < rawKeyMagic.byteLength) return false;
  for (let i = 0; i < rawKeyMagic.byteLength; i++) {
    if (key[i] !== rawKeyMagic[i]) return false;
  }
  return true;
}

/** Decoder workers for a key file on the single-thread path. */
function decoderWorkers(): number {
  const reported = globalThis.navigator?.hardwareConcurrency;
  if (reported === undefined || !Number.isFinite(reported) || reported < 1) return 4;
  return Math.min(8, Math.floor(reported));
}

async function loadKey(
  fileName: string,
  key: Uint8Array,
  keySha256: string,
  exportRaw: boolean,
): Promise<{ key: string; inputs: number; outputs: number; raw?: Uint8Array }> {
  const module = requireRuntime();
  // One key at a time: its points are most of the wasm heap.
  loaded?.prover.free();
  loaded = undefined;
  let prover: ZolanaProver;
  if (pooled || isRawKey(key)) {
    prover = new module.ZolanaProver(key);
  } else {
    const vectors = await decodeKey(module, key, decoderWorkers());
    if (vectors.length !== 5) throw new Error("key decompress returned the wrong vectors");
    prover = module.ZolanaProver.from_vectors(
      key,
      vectors[0]!,
      vectors[1]!,
      vectors[2]!,
      vectors[3]!,
      vectors[4]!,
    );
  }
  if (prover.digest() !== keySha256) {
    prover.free();
    throw new WasmProverError("wasm_key_digest_mismatch");
  }
  loaded = { fileName, prover };
  const info = { key: prover.name(), inputs: prover.inputs(), outputs: prover.outputs() };
  if (!exportRaw) return info;
  const raw = prover.export_raw();
  return raw.byteLength === 0 ? info : { ...info, raw };
}

async function prove(body: string): Promise<ProofValue> {
  if (loaded === undefined) throw new Error("no key is loaded");
  const { prover } = loaded;
  try {
    return await prover.prove(body);
  } catch (error) {
    // A GPU that failed, or whose arithmetic went wrong: the CPU proves
    // from now on.
    if (!prover.has_gpu()) {
      if (error === "unverified") throw new WasmProverError("wasm_verify_failed");
      throw error;
    }
    prover.drop_gpu();
    try {
      return await prover.prove(body);
    } catch (retried) {
      if (retried === "unverified") throw new WasmProverError("wasm_verify_failed");
      throw retried;
    }
  }
}

async function handle(request: WorkerRequest): Promise<unknown> {
  switch (request.kind) {
    case "init":
      await init(request.threads);
      return {
        initialized: true,
        threads: activeThreads,
        rawKeyFormat: requireRuntime().raw_format(),
      };
    case "loadKey":
      return await loadKey(
        request.fileName,
        new Uint8Array(request.key),
        request.keySha256,
        request.exportRaw,
      );
    case "prove":
      return await prove(request.body);
    case "loadedKeys":
      return { keys: loaded === undefined ? [] : [loaded.fileName] };
  }
}

let queue = Promise.resolve();
self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const started = performance.now();
  queue = queue
    .then(() => handle(request))
    .then(
      (value) => {
        const response: WorkerResponse = {
          id: request.id,
          ok: true,
          value,
          ms: performance.now() - started,
        };
        // A raw key is tens of megabytes; move it rather than copy it.
        const raw = (value as { raw?: unknown } | undefined)?.raw;
        self.postMessage(response, raw instanceof Uint8Array ? [raw.buffer] : []);
      },
      (error: unknown) => {
        // Only a code crosses the boundary: the runtime's messages may echo
        // the request.
        const response: WorkerResponse = {
          id: request.id,
          ok: false,
          error: error instanceof WasmProverError ? error.code : operationError(request.kind).code,
          ms: performance.now() - started,
        };
        self.postMessage(response);
      },
    );
});
