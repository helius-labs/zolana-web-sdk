/**
 * The prover runtime: zopro-zolana's `web` module as wasm-bindgen emits it
 * (`zopro_zolana.js` beside its wasm), which the package ships in `runtime/`
 * beside the compiled worker, built twice: `threads/` with shared memory and a
 * thread pool, for a cross-origin isolated page, and `single/` without, for any
 * other page, where SharedArrayBuffer is missing.
 */

/** A loaded key, `ZolanaProver` in zopro-zolana. */
export interface ZolanaProver {
  name(): string;
  /** The gnark proving key's sha256 the key file was built from, hex. */
  digest(): string;
  inputs(): number;
  outputs(): number;
  has_gpu(): boolean;
  drop_gpu(): void;
  /** The raw form to cache, once per load of a key file; empty otherwise. */
  export_raw(): Uint8Array;
  /** Rejects with "unverified" when the proof did not verify. */
  prove(request: string): Promise<ProofValue>;
  free(): void;
}

export interface ProofValue {
  /** The proof JSON the prover server returns. */
  proof: string;
  witnessMs: number;
  proveMs: number;
  verifyMs: number;
}

export interface Runtime {
  default(): Promise<unknown>;
  /**
   * Requests WebGPU; keys loaded after it prove their MSMs and quotient there.
   * False without WebGPU.
   */
  init_gpu(): Promise<boolean>;
  /** The layout of the raw form `export_raw` writes. */
  raw_format(): string;
  /** Byte offset and length of each of a key file's five vectors of compressed points. */
  key_vectors(key: Uint8Array): Uint32Array;
  /** A run of a vector's whole compressed points (G2 for the last), decompressed. */
  kernel_points(compressed: Uint8Array, g2: boolean): Uint8Array;
  ZolanaProver: {
    new (key: Uint8Array): ZolanaProver;
    /** A key file whose vectors were decompressed elsewhere, each joined in order. */
    from_vectors(
      key: Uint8Array,
      a: Uint8Array,
      b: Uint8Array,
      k: Uint8Array,
      z: Uint8Array,
      b2: Uint8Array,
    ): ZolanaProver;
  };
}

export interface ThreadedRuntime extends Runtime {
  initThreadPool(threads: number): Promise<void>;
}

/** The runtime with a thread pool, uninitialized; the app's bundler emits it with its wasm and thread helpers. */
export async function importThreadedRuntime(): Promise<ThreadedRuntime> {
  return await import("./runtime/threads/zopro_zolana.js");
}

/** The runtime without shared memory, uninitialized; the app's bundler emits it with its wasm. */
export async function importSingleRuntime(): Promise<Runtime> {
  return await import("./runtime/single/zopro_zolana.js");
}
