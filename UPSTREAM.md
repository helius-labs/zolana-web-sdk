# Upstream

The browser example depends on the published `@heliuslabs/zolana@0.3.1-alpha`. `wasm` follows `helius-labs/zolana` at `711220e530a9a59605a858181b17c58460e677c4`, the commit that release was cut from, so the bridge accepts that SDK's `/prove` requests and proves with the keys pinned in `wasm/prover/provingkeys/proving-keys.lock`.

Source mapping:

- `poc/core` -> `packages/web-prover` (from branch `feat/mopro-browser-arkworks` at `87e9463b0d5b9527282ff7d77687258c92bb696e`)
- `poc/web` -> `examples/browser` (same branch and commit)
- `prover/server/cmd/prover-wasm` -> `wasm/prover-wasm` (same branch and commit, ported to the circuits above)
- `prover/server/go.mod`, `go.sum`, the packages `prover-wasm` imports and the packages their tests import -> `wasm`

Local changes to preserve when re-extracting:

- `common.FromHex` returns a fixed error that does not echo its input.
- Go tests read the cross-language vectors from `wasm/test-vectors`, copied from the upstream root `test-vectors`.
- `wasm/prover-wasm/testdata/transfer-2x3.json` is `fixtures/prove-request-2x3.json` from `helius-labs/zolana-mobile-sdk` at `b1897a32eda6d3ddcd6f602de186c41696ae51ab`, captured from the client at `a7846c611d4effa41f1256dd5f1367c076117be5`, which has the same circuits and keys as the commit above.

The standalone package name, worker factory, workspace scripts, import paths, and asset staging paths are maintained here.
