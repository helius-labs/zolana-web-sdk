/**
 * The prover runtime: zopro-zolana's `web` module as wasm-bindgen emits it
 * (`zopro_zolana.js` beside its wasm and `snippets/`).
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
  initThreadPool(threads: number): Promise<void>;
  /** Requests WebGPU; keys loaded after it prove their MSMs and quotient there. */
  init_gpu(): Promise<void>;
  /** The layout of the raw form `export_raw` writes. */
  raw_format(): string;
  ZolanaProver: new (key: Uint8Array) => ZolanaProver;
}

/** Imports the runtime from the directory at `url`, uninitialized. */
export async function importRuntime(url: string): Promise<Runtime> {
  const directory = new URL(url, self.location.href);
  if (!directory.pathname.endsWith("/")) directory.pathname += "/";
  return (await import(/* @vite-ignore */ new URL("zopro_zolana.js", directory).href)) as Runtime;
}
