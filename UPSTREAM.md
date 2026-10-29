# Upstream

`upstream.lock.json` pins the protocol release and the npm SDK the wallet example
uses: v0.6.0-alpha, source `8ae430a154e22bafa819a570d383d04e2046e802`.
Protocol compatibility is separate from deployment URLs, TEE policy updates and
the publication location of converted proving keys.

CI also builds and packs the SDK at `5cfd7eaed15ef29dc95f6b212cd2844ed0e86860`
([#501](https://github.com/helius-labs/zolana/pull/501)) and checks the wallet
example against it. The installed dependency stays on `0.6.0-alpha` until an npm
release includes that commit. Local clients explicitly select
`proofDataSource: "client"`; the remote client uses the protocol SDK's routing.

`key-catalog-source.json` pins the reviewed upstream `zopro-keys.lock` by commit
and SHA-256. `python3 scripts/sync-key-catalog.py` copies that manifest into this
repository, adding its CDN base URL; `--check` fails on drift. CI checks it and
compares each `key_sha256` with the protocol release's gnark pin and installed
SDK. Set `ZOLANA_SRC` to use an existing upstream Git checkout for these checks.

Each zopro key has its own byte checksum and the digest of the source gnark key.
The gnark and zopro version prefixes can differ: upstream's 136-key catalog uses
`7802e6a064832ccb` for gnark while the 41 unchanged conversions remain under
`8e234b5a589cfb79`. Adding unrelated circuits does not require rebuilding these
conversions, republishing them, or invalidating their caches.

Runtime `keyCatalog` input can change download URLs only for conversions whose
checksums and sizes match the bundled pins. It neither adds supported circuits
nor replaces the trusted conversion manifest.

The runtime is zopro-zolana at the revision `runtime.lock.json` pins (`scripts/build-runtime.sh`).

Source mapping:

- `poc/core` -> `packages/web-prover` (from branch `feat/mopro-browser-arkworks` at `87e9463b0d5b9527282ff7d77687258c92bb696e`)
- `poc/web` -> `examples/browser` (same branch and commit)

`fixtures/` holds valid requests for each benchmarked shape on trees of their own, from zk-tools' `zopro/tools/zolana/fixtures` at the runtime's revision: zolana's request and merge fixtures with the shape changed.
