# Changelog

## 0.3.0-alpha — 2026-10-20

The runtime ships in the package: an app installs it with npm, its bundler emits the worker, the Go bridge and the accelerator, and threaded proving works in a Chrome extension page.

Breaking

- `WasmProverOptions.wasmUrl` is gone; the worker loads the Go bridge and the accelerator from beside itself, where Vite and webpack 5 emit them.
- `zolana-prover-assets` is now `zolana-prover-keys --output <directory> --keys <names>`, which installs proving keys for self-hosting and nothing else.

Changed

- Runtime 0.3.2, the 0.3.1 accelerator with Rayon's thread helpers for bundlers: its threads start from files the bundler emits rather than from `blob:` URLs, which an extension page refuses, so 0.2.0-alpha proves there only with `threads: 0`.
- A thread pool that has not started after 30 s fails initialization with `wasm_init_failed` instead of waiting forever.

## 0.2.0-alpha — 2026-10-20

The first release. `ZolanaWebProver` proves `@heliuslabs/zolana` 0.4.0-alpha transfer and merge requests in a browser worker with the threaded accelerator of runtime 0.3.1, verifies each proof before it returns it, and answers the SDK's `/prove` requests in the page through `createFetch()`. A warm proof takes 0.31 s for two notes to two outputs and 0.97 s for eight, in Chrome at four threads on an Apple M5 Pro.

- Keys load on first use from the pinned key set on the Zolana key CDN (`KEY_BASE_URL`), so an app installs none; `keyBaseUrl` points the prover at self-hosted keys. Every key is checked against the size and SHA-256 bundled in the package from the pinned lockfile.
- `zolana-prover-assets` installs the Go bridge, the pinned accelerator and by default the 2x2 key into the app's public directory; `--keys none` installs no key, and `--keys` picks any pinned transfer or merge key for self-hosting.
- A key's first load decompresses its points on the accelerator's thread pool, and the Cache API then keeps the decoded raw form in place of the downloaded file, so a later load, including after a reload, takes 0.08 s to 1.8 s for the benchmarked shapes.
- `prover.prefetch({ shapes, signal, onProgress })` downloads, checks and decodes keys before the proofs that need them, skipping shapes already cached; `onKeyProgress` reports each key's download bytes and decode stage for every load.
- Keys live in the Cache API store `zolana-proving-keys-<key set>`, and stores of other key sets are deleted on first use; `persistStorage` asks the browser to keep them under storage pressure.
- `WasmProverError.code` names each failure without backend messages or witness values; `wasm_key_manifest_error` means the requested key is not in the pinned key set.
