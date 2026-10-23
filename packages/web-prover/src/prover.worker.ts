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
 */

import type { WorkerRequest, WorkerResponse } from "./wasm-prover.js";
import { operationError, WasmProverError } from "./errors.js";
import { importRuntime, type ProofValue, type Runtime, type ZolanaProver } from "./runtime.js";

let runtime: Runtime | undefined;
let activeThreads = 0;
let loaded: { fileName: string; prover: ZolanaProver } | undefined;

// Rayon's helpers wait for every thread to report ready, and a thread whose script
// the page refuses never does; a pool that has not started by then has failed.
const threadPoolTimeoutMs = 30_000;

async function init(threads: number): Promise<void> {
  if (runtime !== undefined) return;
  if (!Number.isInteger(threads) || threads < 1 || threads > 64) {
    throw new Error("Threads must be an integer between 1 and 64");
  }
  if (!globalThis.crossOriginIsolated)
    throw new Error(
      "Proving requires cross-origin isolation. Use the Vite server with COOP/COEP headers.",
    );
  const module = await importRuntime();
  await module.default();
  await withTimeout(module.initThreadPool(threads), threadPoolTimeoutMs);
  if ("gpu" in navigator) await module.init_gpu();
  runtime = module;
  activeThreads = threads;
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

function loadKey(
  fileName: string,
  key: Uint8Array,
  keySha256: string,
  exportRaw: boolean,
): { key: string; inputs: number; outputs: number; raw?: Uint8Array } {
  const { ZolanaProver } = requireRuntime();
  // One key at a time: its points are most of the wasm heap.
  loaded?.prover.free();
  loaded = undefined;
  const prover = new ZolanaProver(key);
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
      return loadKey(
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
