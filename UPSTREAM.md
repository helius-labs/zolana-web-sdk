# Upstream

Extracted from `helius-labs/zolana` branch `origin/feat/mopro-browser-demo`.

Source mapping:

- `poc/core` -> `packages/web-prover`
- `sdk-libs/ts` -> `packages/zolana`
- `poc/web` -> `examples/browser`
- `prover/server/cmd/prover-wasm` and its internal dependencies -> `wasm`

The standalone package name, worker factory, workspace scripts, import paths, and asset staging paths are maintained here. Re-extractions should preserve those changes while updating the snapshots.
