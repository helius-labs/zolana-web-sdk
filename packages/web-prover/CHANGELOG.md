# Changelog

## 0.2.0-alpha — unreleased

The first published release. Proving keys load in a fraction of a second after a shape's first use, are checked against digests bundled in the package, and can be fetched ahead of a proof with progress reporting.

Breaking

- `keys/manifest.json` is no longer read; every key is checked against the size and SHA-256 bundled from the pinned lockfile, and `zolana-prover-assets` no longer writes the manifest → serve the key files only.
- The bundled Go bridge changed its key-loading call → rerun `zolana-prover-assets` after upgrading; the worker still loads keys into the previous bridge, without the raw-key cache below.

Added

- `WasmProverOptions.keyBaseUrl` is optional and defaults to the pinned key set on the Zolana key CDN (`KEY_BASE_URL`), so an app installs no keys; set it to self-host them.
- `zolana-prover-assets --keys none` installs the runtime without any key.
- `prover.prefetch({ shapes, signal, onProgress })` downloads, checks and decodes keys before the proofs that need them, skipping shapes already cached.
- `WasmProverOptions.onKeyProgress` reports each key's download bytes and decode stage for every load; `KeyProgress` is exported.
- `WasmProverOptions.persistStorage` asks the browser to keep cached keys under storage pressure.
- `zolana-prover-assets --keys` accepts every pinned merge key (`merge_8_1`, `merge_24_1`, `merge_54_1`).

- The repository's proof timing harness (`examples/browser/scripts/proof-timing.mjs`, `scripts/proof-timing-report.mjs`) times transfers of 1 to 24 notes and a merge of 24 through the benchmark page in headless Chrome, in the four scenarios the mobile SDK reports; CI comments the report on every pull request and keeps the history of `main` on the `proof-timing` branch.

Changed

- After a shape's first load the Cache API keeps the bridge's raw re-encoding of the key in place of the pinned file, so a later load skips point decompression: 2x2 loads in about 0.15 s instead of 3.9 s, 8x8 in 0.54 s instead of 15 s.
- Keys live in the Cache API store `zolana-proving-keys-<key set>`; stores of other key sets, including 0.1.0-alpha's, are deleted on first use.
- `wasm_key_manifest_error` now means the requested key is not in the pinned key set.

## 0.1.0-alpha — unpublished

Local Groth16 proving of `@heliuslabs/zolana` 0.4.0-alpha transfer and merge requests in a worker, with the Arkworks threaded kernel, proving keys cached in the Cache API, and a `fetch` that answers `/prove` in the page.
