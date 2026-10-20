# Zolana Web SDK

Local Zolana Groth16 proving in the browser: `@heliuslabs/zolana-web-prover`, a private wallet example that proves every transaction in the page, and a prover benchmark.

**Performance.** With runtime 0.3.2 in Chrome at four threads on an Apple M5 Pro, a warm proof (key loaded, nothing to download) takes 0.20 s for one note to two outputs, 0.31 s for two, 0.54 s for four, 0.97 s for eight, 1.8 s for sixteen and 2.7 s for twenty-four; the first proof after a page reload adds the key's load from the raw-key cache (0.08 s to 1.8 s), and the first ever its download (9 MB to 180 MB). CI benches every pull request on four-core runners, about 3.5 times slower than that machine, and keeps the history of `main` on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch; "Proof timing" below describes the harness.

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

`npm run setup` builds the package, with the sanitized Go bridge built by Go 1.27.1 and the pinned accelerator fetched from its runtime release and checked against `runtime.lock.json`, stages the request fixtures, and installs the 2-input/2-output proving key for the benchmark. Source builds require Go; an app that installs the package needs only its bundler, not Go, Rust, Mopro or `wasm-pack`.

The demo requires cross-origin isolation for the threaded Mopro kernel. Its Vite server already sends the required COOP/COEP headers.

## Validation

```sh
npm run check
npm run test:browser
npm run test:consumer
```

The browser test starts and stops its own Vite server. CI runs only these hermetic gates; the wallet example's devnet test, run by hand with a funded key, is the end-to-end check with requests the SDK builds. Set `DEMO_URL` only when testing an already-running deployment.

The consumer gate packs the prover, installs it outside the workspace without protocol/Solana packages and with no asset step, checks strict TypeScript with `skipLibCheck: false` in NodeNext and bundler modes, builds an app with Vite and with webpack 5, and runs Go and Arkworks proofs from both builds and from the Vite build loaded as an MV3 extension page, with malformed-witness privacy and recovery checks. It needs Chrome, and installs Chrome for Testing under `target/` for the extension, which branded Chrome no longer loads from the command line.

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

CI benches every shape on every pull request, beside the checks, in headless Chrome against one build of the page, on two runners with their own processors: Linux, a 4-core server VM (AMD EPYC), says whether a change made proving faster or slower, and macOS, a 3-core Apple M1 VM, is the nearest to a laptop. One comment shows the proof time by runner, with the change against the last commit of `main`, and each runner's tables below it. After each push to `main` the report is commented on the commit, against the commit before it, and joins the history on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch, a table of the last commits per runner. Those numbers say whether a change made proving faster or slower on a runner; what a laptop takes comes from the same harness on that laptop.

```sh
ZOLANA_TIMING_SHAPES=1x2,8x2 ZOLANA_TIMING_DIR=/tmp/timing node examples/browser/scripts/proof-timing.mjs
node scripts/proof-timing-report.mjs --logs /tmp/timing
```

The lines land in `/tmp/timing/<label>/` (`chrome-linux`, `chrome-macos` or `chrome-windows` unless `ZOLANA_TIMING_LABEL` names the machine), beside a `runner.json` with the browser, system, processor, memory and thread count; `ZOLANA_TIMING_BUILT=1` times the built page (`npm run build:example`) instead of the dev server.

The requests are `wasm/prover-wasm/testdata/transfer-*.json` and `merge-*.json`, valid witnesses on trees of their own (the mobile SDK's `tools/prove-fixtures` wrote them). Keys load from where the page loads them, so set `VITE_ZOLANA_KEYS_URL` to the key CDN for shapes not staged under `public/keys`. `ZOLANA_TIMING_ROUNDS` (4, and 2 for shapes over 8 notes) is the proofs per shape and run; `ZOLANA_TIMING_THREADS=4` sizes the kernel's pool as on a four-core laptop.

## Runtime releases

The accelerator is built by maintainers and published as a versioned GitHub release, with Rayon's thread helpers for bundlers: Mopro's template builds the helpers for pages without one, which start their threads from `blob:` URLs that extension pages refuse. `runtime.lock.json` pins the release manifest by SHA-256, and the manifest pins every file; `npm run build:prover` fetches and checks them into the package, beside the Go bridge and shim it builds from this repository. Proving keys are fetched from their immutable CloudFront prefix and checked against `wasm/prover/provingkeys/proving-keys.lock`.

To rebuild runtime assets manually, use the pinned Mopro checkout and the committed build script:

```sh
git clone https://github.com/sergeytimoshin/mopro.git /tmp/mopro
git -C /tmp/mopro checkout d352504704d83c5a4a2eae9d42d7db9b4ab3f80e
npm run build:runtime -- 0.3.2 /tmp/mopro
```

Maintainers can run the `Runtime release` GitHub Actions workflow instead. After publishing a new runtime, update the version, release URL, size, and SHA-256 in `runtime.lock.json`; `ZOLANA_RUNTIME_BASE_URL` points the build at a local copy of the pinned release, as a `file://` directory.

## SDK

Install the package and import it: the app's bundler (Vite or webpack 5) emits the worker, the Go bridge and the accelerator from it, and proving keys load from the key CDN on first use. See the [package guide](packages/web-prover/README.md) for headers, extension pages, key hosting, integrity, error codes and lifecycle behavior. To serve keys yourself, `npx zolana-prover-keys --output public/keys --keys transfer_confidential_1_2.key,transfer_confidential_2_2.key` installs the shapes you name, checked against the lockfile; only one deserialized key is resident, but downloaded keys consume storage and proving requires additional working memory.

```ts
import { ZolanaWebProver } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({ proverUrl: "http://localhost:3001" });

const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
const localFetch = prover.createFetch();
```

The worker starts automatically on first use. Pass an `AbortSignal` to cancel queued or active work. Active cancellation discards the runtime and its queue; later requests can restart through the retained factory. `terminate()` releases the runtime and clears that factory, so create a new instance or explicitly call `start(factory)` afterward.

Flow, submission and benchmark helpers are in `examples/browser/src/{flow,submit,bench,sweep-amounts}.ts`; they are intentionally no longer core exports.
