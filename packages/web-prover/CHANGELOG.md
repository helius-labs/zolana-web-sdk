# Changelog

## 0.2.0-alpha — unreleased

The first published release. Proofs are made by zopro, a Rust Groth16 prover for gnark's circuits: one WebAssembly module that turns a `/prove` request into the circuit's witness, proves on a thread pool and on WebGPU where the browser has it, and verifies the proof before it returns it. A warm 2x2 proof takes 0.09 s at four threads on an Apple M5 Pro with WebGPU, 8x2 0.21 s and 24x2 0.61 s; on the CPU alone 0.29 s, 0.92 s and 2.8 s. Keys load in a fraction of a second after a shape's first use, are checked against digests bundled in the package, and can be fetched ahead of a proof with progress reporting.

Breaking

- `WasmProverOptions.runtimeUrl` names the directory the asset command installs the runtime in (`/prover/`), holding `zopro_zolana.js`, its wasm and `snippets/`.
- Proving needs cross-origin isolation and at least one thread (`threads`, by default the browser's processors up to 18).
- Keys are zopro keys, `<name>.zopro`, each built from the pinned gnark key of the same name and checked against the size and SHA-256 bundled in the package from `zopro-keys.lock`; `keys/manifest.json` is not read and `zolana-prover-assets` writes none → serve the `.zopro` files only.

Added

- `WasmProverOptions.keyBaseUrl` is optional and defaults to the pinned key set on the Zolana key CDN (`KEY_BASE_URL`), so an app installs no keys; set it to self-host them.
- `zolana-prover-assets --keys none` installs the runtime without any key; `--keys` accepts every pinned transfer and merge key (`merge_8_1`, `merge_24_1`, `merge_54_1`).
- `prover.prefetch({ shapes, signal, onProgress })` downloads, checks and decodes keys before the proofs that need them, skipping shapes already cached.
- `WasmProverOptions.onKeyProgress` reports each key's download bytes and decode stage for every load; `KeyProgress` is exported.
- `WasmProverOptions.persistStorage` asks the browser to keep cached keys under storage pressure.
- After a shape's first load the Cache API keeps the runtime's raw form of the key (points decompressed, solver built) in place of the pinned file: 2x2 loads in 0.03 s instead of 1.5 s, 24x2 in 0.32 s instead of 17 s.
- Keys live in the Cache API store `zolana-proving-keys-<key set>`; stores of other key sets, including 0.1.0-alpha's, are deleted on first use.
- A proof made on the GPU that does not verify is proved again on the CPU, which proves that key from then on; `wasm_verify_failed` means a proof did not verify on the CPU either.
- `wasm_key_manifest_error` means the requested key is not in the pinned key set, and `wasm_key_digest_mismatch` also that a key file was built from another gnark key.
- The repository's proof timing harness (`examples/browser/scripts/proof-timing.mjs`, `scripts/proof-timing-report.mjs`) times transfers of 1 to 24 notes and a merge of 24 through the benchmark page in headless Chrome, in the four scenarios the mobile SDK reports; CI comments the report on every pull request and keeps the history of `main` on the `proof-timing` branch.

## 0.1.0-alpha — unpublished

Local Groth16 proving of `@heliuslabs/zolana` 0.4.0-alpha transfer and merge requests in a worker, with the Arkworks threaded kernel, proving keys cached in the Cache API, and a `fetch` that answers `/prove` in the page.
