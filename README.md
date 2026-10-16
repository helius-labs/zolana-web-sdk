# Zolana Web SDK

Local Zolana Groth16 proving in the browser: `@heliuslabs/zolana-web-prover`, a private wallet example that proves every transaction in the page, and a prover benchmark.

## Packages

- `@heliuslabs/zolana-web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- [`examples/wallet`](examples/wallet/README.md) is the integration example: a devnet private wallet on the published `@heliuslabs/zolana@0.4.0-alpha` that registers, shields, sends privately and unshields, with every proof made in the page. Start here.
- `examples/browser` is a prover benchmark. It proves a synthetic 2x2 transfer request, a valid witness for the real proving key whose tree roots exist on no chain, to time the Go and Arkworks engines on one proof or five.
- `@heliuslabs/zolana-web-prover` matches `@heliuslabs/zolana@0.4.0-alpha`'s `/prove` requests and proving keys (see [UPSTREAM.md](UPSTREAM.md)) without depending on it.
- `wasm` is a self-contained Go module for the browser prover bridge.

## Setup

```sh
npm ci
npm run setup
npm run dev         # the benchmark
npm run dev:wallet  # the wallet example, after its setup in examples/wallet/README.md
```

`npm run setup` builds the sanitized Go bridge with Go 1.27.1 and stages the demo request fixture, then downloads and verifies the pinned accelerator and the 2-input/2-output proving key. Source builds require Go; installed-package users need only Node.js and the asset command, not Go, Rust, Mopro or `wasm-pack`. Setup never restores the old pinned release's Go Wasm, shim or request fixture.

The demo requires cross-origin isolation for the threaded Mopro kernel. Its Vite server already sends the required COOP/COEP headers.

## Validation

```sh
npm run check
npm run test:browser
npm run test:consumer
```

The browser test starts and stops its own Vite server. CI runs only these hermetic gates; the wallet example's devnet test, run by hand with a funded key, is the end-to-end check with requests the SDK builds. Set `DEMO_URL` only when testing an already-running deployment.

The consumer gate packs the prover, installs it outside the workspace without protocol/Solana packages, checks strict TypeScript with `skipLibCheck: false` in NodeNext and bundler modes, and runs production-built Go and Arkworks proofs with malformed-witness privacy and recovery checks. It needs Chrome and the staged runtime/key assets. Existing Go, example and browser gates remain enabled.

The opt-in devnet gate runs the example's shield, split, transfer and unshield flow through the published SDK. The packaged worker produces every proof locally, and the test fails unless each proof lands on-chain:

```sh
npm run build:prover
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
ZOLANA_E2E_RPC_URL="https://devnet.helius-rpc.com/?api-key=$API_KEY" \
npm run test:e2e
```

The funder tops up two fresh wallets with 0.06 devnet SOL and receives the remainder back. Use a keyed RPC; the public devnet endpoint rate-limits confirmation polling.

### Proof timing

The same table the mobile SDK reports, from the browser: `examples/browser/scripts/proof-timing.mjs` drives the benchmark page in headless Chrome through four scenarios per shape (first run including the key's fetch and decode, warm, first run after a page reload with the key in the raw-key cache, repeated) and prints one `ZOLANA_TIMING {json}` line per proof; `scripts/proof-timing-report.mjs` turns the lines into the report, with the change against a baseline. The shapes are transfers of 1, 2, 4, 8, 16 and 24 notes to two outputs (`1x2` to `24x2`) and a merge of 24 notes (`merge-24x1`); a shape that fails shows as failed and the others still run.

CI benches every shape on every pull request, in a job beside the checks, and comments the report with the change against the last commit of `main`. After each push to `main` the report is commented on the commit, against the commit before it, and joins the history on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch, a table of the last commits. Those numbers say whether a change made proving faster or slower on a runner; what a device takes comes from the same harness on that device.

```sh
ZOLANA_TIMING_SHAPES=1x2,8x2 ZOLANA_TIMING_DIR=/tmp/timing node examples/browser/scripts/proof-timing.mjs
node scripts/proof-timing-report.mjs --logs /tmp/timing
```

The requests are `wasm/prover-wasm/testdata/transfer-*.json` and `merge-*.json`, valid witnesses on trees of their own (the mobile SDK's `tools/prove-fixtures` wrote them). Keys load from where the page loads them, so set `VITE_ZOLANA_KEYS_URL` to the key CDN for shapes not staged under `public/keys`. `ZOLANA_TIMING_ROUNDS` (4, and 2 for shapes over 8 notes) is the proofs per shape and run; `ZOLANA_TIMING_THREADS=4` sizes the kernel's pool as on a phone.

## Runtime releases

The accelerator runtime is built by maintainers and published as a versioned GitHub release. `runtime.lock.json` pins the release manifest by SHA-256, while the manifest pins every downloaded runtime file. The Go bridge and matching shim are rebuilt from this repository for each SDK build and bundled in the npm artifact; setup ignores their older release copies. Proving keys are fetched from their immutable CloudFront prefix and checked against `wasm/prover/provingkeys/proving-keys.lock`.

To rebuild runtime assets manually, use the pinned Mopro checkout and the committed build script:

```sh
git clone https://github.com/sergeytimoshin/mopro.git /tmp/mopro
git -C /tmp/mopro checkout 2bb184c23463d6415ebb5c9110bfd779df910d2f
npm run build:runtime -- 0.1.0 /tmp/mopro
```

Maintainers can run the `Runtime release` GitHub Actions workflow instead. After publishing a new runtime, update the version, release URL, size, and SHA-256 in `runtime.lock.json` before changing the SDK default.

For local development with already-built Mopro bindings and keys, `npm run stage:assets -- <MoproWasmBindings> <keys-directory>` remains available.

## SDK

For an installed package without this repository, run `npx --no-install zolana-prover-assets --output public`. See the [package guide](packages/web-prover/README.md) for asset hosting, integrity, supported bundlers, error codes and lifecycle behavior. The sanitized Go bridge ships in the package; the accelerator and proving keys are downloaded only when you explicitly run the asset command.

The default key is demo-only 2x2. For real transfers, explicitly select the needed locked shapes, for example `--keys transfer_confidential_1_2.key,transfer_confidential_2_2.key`. This replaces the default selection; only one deserialized key is resident, but downloaded keys consume storage and proving requires additional working memory.

```ts
import { ZolanaWebProver } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({
  wasmUrl: "/prover/zolana-prover.wasm",
  keyBaseUrl: "/keys",
  proverUrl: "http://localhost:3001",
});

const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
const localFetch = prover.createFetch();
```

The worker starts automatically on first use. Pass an `AbortSignal` to cancel queued or active work. Active cancellation discards the runtime and its queue; later requests can restart through the retained factory. `terminate()` releases the runtime and clears that factory, so create a new instance or explicitly call `start(factory)` afterward.

Flow, submission and benchmark helpers are in `examples/browser/src/{flow,submit,bench,sweep-amounts}.ts`; they are intentionally no longer core exports. The pinned accelerator release remains unchanged; builds package the sanitized Go bridge locally, without publishing or replacing a remote release.
