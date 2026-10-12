# Upstream

The browser example depends on the published `@heliuslabs/zolana@0.4.0-alpha`. `wasm` follows `helius-labs/zolana` at tag `v0.4.0-alpha` (`0fde5f1e1e209b85896362c9293ec0b60bbf7563`), the commit that release was cut from, so the bridge accepts that SDK's `/prove` requests and proves with the keys pinned in `wasm/prover/provingkeys/proving-keys.lock`. A new SDK release re-pins both together.

Source mapping:

- `poc/core` -> `packages/web-prover` (from branch `feat/mopro-browser-arkworks` at `87e9463b0d5b9527282ff7d77687258c92bb696e`)
- `poc/web` -> `examples/browser` (same branch and commit)
- `prover/server/cmd/prover-wasm` -> `wasm/prover-wasm` (same branch and commit, ported to the circuits above)
- `prover/server/go.mod`, `go.sum`, the packages `prover-wasm` imports and the packages their tests import -> `wasm`, leaving out files built only with the `aeglos` tag and the `prover/backend` GPU docs and source lock

Local changes to preserve when re-extracting:

- `common.FromHex` returns a fixed error that does not echo its input.
- Go tests read cross-language vectors from `wasm/test-vectors`, copied from the upstream root `test-vectors` and, for `indexed-proof.json`, `sdk-libs/fixtures`.
- `wasm/circuits/spp_transaction/shared/web_fixture_test.go` is not upstream. It writes `wasm/prover-wasm/testdata/transfer-2x2.json`, a deterministic satisfying 2x2 request built with upstream's test helpers: `WEB_FIXTURE=$PWD/prover-wasm/testdata/transfer-2x2.json go test ./circuits/spp_transaction/shared -run TestWriteWebFixture` from `wasm`.

The standalone package name, worker factory, workspace scripts, import paths, and asset staging paths are maintained here.
