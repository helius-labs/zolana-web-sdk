/**
 * The prover runtime: zopro-prover's `web` module as wasm-bindgen emits it
 * (`zopro_prover.js` beside its wasm and `snippets/`).
 */

/** A loaded key, `WebProver` in zopro-prover. */
export interface WebProver {
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
  initThreadPool(threads: number): Promise<void>;
  /** Requests WebGPU; keys loaded after it prove their MSMs and quotient there. */
  init_gpu(): Promise<void>;
  /** The layout of the raw form `export_raw` writes. */
  raw_format(): string;
  WebProver: new (key: Uint8Array) => WebProver;
}

/** Imports the runtime from the directory at `url`, uninitialized. */
export async function importRuntime(url: string): Promise<Runtime> {
  const directory = new URL(url, self.location.href);
  if (!directory.pathname.endsWith("/")) directory.pathname += "/";
  return (await import(/* @vite-ignore */ new URL("zopro_prover.js", directory).href)) as Runtime;
}
