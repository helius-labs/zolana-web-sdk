# Changelog

## 0.4.0-alpha — 2026-10-23

Proofs are made by zopro, a Rust Groth16 prover for gnark's circuits: one WebAssembly module, shipped in the package, that turns a `/prove` request into the circuit's witness, proves on a thread pool and on WebGPU where the browser has it, and verifies the proof before it returns it. A warm 2x2 proof takes 0.08 s at four threads on an Apple M5 Pro with WebGPU, 8x2 0.17 s and 24x2 0.43 s; on the CPU alone 0.28 s, 0.87 s and 2.6 s.

Breaking

- Proves the requests of `@heliuslabs/zolana` 0.5.0-alpha (zolana v0.5.0-alpha, which devnet-d runs) with the zopro keys of its key set, `8e234b5a589cfb79`: a merge carries its mint chunks and output ciphertext salt. The browser merges 8 or 24 notes (`MAX_BROWSER_MERGE_INPUTS`); the 52-note key does not fit in wasm32's 4 GB of memory beside its cached raw form, and a wider merge fails with `wasm_merge_too_wide`. Requests and keys of 0.4.0-alpha fail.
- `@heliuslabs/zolana` 0.5.0-alpha encrypts its calls to a remote prover for the prover's attested enclave, which `createFetch()` cannot read. Give the SDK and the prover a loopback `proverUrl`, which that SDK sends plaintext, as the wallet example does.
- Proving needs cross-origin isolation and at least one thread (`threads`, by default the browser's processors up to 18).
- Keys are zopro keys, `<name>.zopro`, each built from the pinned gnark key of the same name and checked against the size and SHA-256 bundled in the package from `zopro-keys.lock`; `zolana-prover-keys` installs the `.zopro` files, and a self-hosted `keyBaseUrl` serves them.

Changed

- After a shape's first load the Cache API keeps the runtime's raw form of the key (points decompressed, solver built) in place of the pinned file: 2x2 loads in 0.03 s instead of 1.5 s, 24x2 in 0.32 s instead of 17 s.
- A proof made on the GPU that does not verify is proved again on the CPU, which proves that key from then on; `wasm_verify_failed` means a proof did not verify on the CPU either.
- `wasm_key_digest_mismatch` also means a key file was built from another gnark key.

## 0.3.1-alpha — 2026-10-20

- Published with npm provenance. No code changes.

## 0.3.0-alpha — 2026-10-20

The runtime ships in the package: an app installs it with npm, its bundler emits the worker, the Go bridge and the accelerator, and threaded proving works in a Chrome extension page.

Breaking

- `WasmProverOptions.wasmUrl` is gone; the worker loads the Go bridge and the accelerator from beside itself, where Vite and webpack 5 emit them.
- `zolana-prover-assets` is now `zolana-prover-keys --output <directory> --keys <names>`, which installs proving keys for self-hosting and nothing else.

Changed

- Runtime 0.3.2, the 0.3.1 accelerator with Rayon's thread helpers for bundlers: its threads start from files the bundler emits rather than from `blob:` URLs, which an extension page refuses, so 0.2.0-alpha proves there only with `threads: 0`.
- A thread pool that has not started after 30 s fails initialization with `wasm_init_failed` instead of waiting forever.
- A key downloads in ranged parts of 8 MB kept in the cache as they arrive, so an interrupted download resumes where it stopped.
- A kept decoded key is checked by its size instead of hashed on every load, about 0.02–0.05 s less per load after a page reload.

Added

- `neededKeys(maxInputs, outputs, maxMergeInputs)` names the keys spends and merges up to those limits prove with, for `prefetch`.
- `prover.provingKeys()` lists every key with the bytes the browser keeps of it and whether its decoded form is kept; `ProvingKeyStatus` is exported.
- `prover.clearKeys()` removes the kept keys, their decoded forms and interrupted downloads.

## 0.2.0-alpha — 2026-10-20

The first release. `ZolanaWebProver` proves `@heliuslabs/zolana` 0.4.0-alpha transfer and merge requests in a browser worker with the threaded accelerator of runtime 0.3.1, verifies each proof before it returns it, and answers the SDK's `/prove` requests in the page through `createFetch()`. A warm proof takes 0.31 s for two notes to two outputs and 0.97 s for eight, in Chrome at four threads on an Apple M5 Pro.

- Keys load on first use from the pinned key set on the Zolana key CDN (`KEY_BASE_URL`), so an app installs none; `keyBaseUrl` points the prover at self-hosted keys. Every key is checked against the size and SHA-256 bundled in the package from the pinned lockfile.
- `zolana-prover-assets` installs the Go bridge, the pinned accelerator and by default the 2x2 key into the app's public directory; `--keys none` installs no key, and `--keys` picks any pinned transfer or merge key for self-hosting.
- A key's first load decompresses its points on the accelerator's thread pool, and the Cache API then keeps the decoded raw form in place of the downloaded file, so a later load, including after a reload, takes 0.08 s to 1.8 s for the benchmarked shapes.
- `prover.prefetch({ shapes, signal, onProgress })` downloads, checks and decodes keys before the proofs that need them, skipping shapes already cached; `onKeyProgress` reports each key's download bytes and decode stage for every load.
- Keys live in the Cache API store `zolana-proving-keys-<key set>`, and stores of other key sets are deleted on first use; `persistStorage` asks the browser to keep them under storage pressure.
- `WasmProverError.code` names each failure without backend messages or witness values; `wasm_key_manifest_error` means the requested key is not in the pinned key set.
