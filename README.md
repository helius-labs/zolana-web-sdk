# Zolana Web SDK

Local Zolana Groth16 proving in the browser: `@heliuslabs/zolana-web-prover`, a private wallet example that proves every transaction in the page, and a prover benchmark.

**Performance.** With the zopro runtime in Chrome at four threads on an Apple M5 Pro, with WebGPU, a warm proof (key loaded, nothing to download) takes 0.06 s for one note to two outputs, 0.08 s for two, 0.11 s for four, 0.17 s for eight, 0.30 s for sixteen and 0.43 s for twenty-four. Without WebGPU the CPU alone takes 0.28 s for two notes, 0.87 s for eight and 2.6 s for twenty-four. The first proof after a page reload adds the key's load from the raw-key cache (0.02 s to 0.32 s). The first ever adds its download (7 MB to 145 MB) and its decode (1 s to 17 s). CI benches every pull request on four-core runners and keeps the history of `main` on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch; "Proof timing" below describes the harness.

## Packages

- `@heliuslabs/zolana-web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- [`examples/wallet`](examples/wallet/README.md) is the integration example: a private wallet on devnet-d that registers, shields, sends privately and unshields, with every proof made in the page. Start here.
- `examples/browser` is the prover benchmark: it proves a synthetic 2x2 transfer request, a valid witness for the real proving key whose tree roots exist on no chain, on one proof or five, and the proof timing harness drives it.
- `@heliuslabs/zolana-web-prover` matches zolana v0.5.0-alpha's `/prove` requests and proving keys (key set `8e234b5a589cfb79`, merges of up to 24 notes in the browser; see [UPSTREAM.md](UPSTREAM.md)) without depending on `@heliuslabs/zolana`. devnet-d runs that release: shielded pool `spp3CfN2Y7se74A27bBpnAkmjXyEb2YmmZafhFrC9xt`, user registry `regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ`.
- The prover runtime is zopro-zolana, Zolana's requests on zopro (a Rust Groth16 prover for gnark circuits), built for the browser from the zopro revision `runtime.lock.json` pins. Its keys are zopro keys built from the gnark proving keys the SDK pins, pinned in `zopro-keys.lock`.

## Setup

```sh
npm ci
npm run setup
npm run dev         # the benchmark
npm run dev:wallet  # the wallet example, after its setup in examples/wallet/README.md
```

`npm run setup` builds the package, with the prover runtime built from the pinned zopro revision with Rust `nightly-2025-11-15` (the `wasm32-unknown-unknown` target and `rust-src`) and wasm-bindgen 0.2.128, stages the request fixtures, and installs the 2-input/2-output proving key for the benchmark (`npm run keys` in `examples/browser`). `ZOPRO_DIR` builds from a zopro checkout instead of a clone of the pinned revision, and `ZOLANA_KEYS_BASE_URL` takes keys from a mirror such as a `file:///.../` directory. Source builds require Rust; an app that installs the package needs only its bundler, not Rust or wasm-bindgen.

The demo's threaded mode requires cross-origin isolation for the runtime's thread pool; its Vite server already sends the required COOP/COEP headers. Choose Single thread in Options (or pass `threads: 0`) for the runtime built without SharedArrayBuffer, which works without isolation.

## Validation

```sh
npm run typecheck   # the runtime, the package's declarations and the examples
npm run check       # unit and script tests, the builds, the pack dry run
npm run check:full  # also the browser test and the consumer gate
```

The browser test starts and stops its own Vite server; set `DEMO_URL` only when testing an already-running deployment. CI runs these hermetic gates; the wallet example's devnet test, run by hand with a funded key, is the end-to-end check with requests the SDK builds.

The consumer gate packs the prover, installs it outside the workspace without protocol/Solana packages and with no asset step, checks strict TypeScript with `skipLibCheck: false` in NodeNext and bundler modes, builds an app with Vite and with webpack 5, and runs proofs at zero, one and two threads from both builds and from the Vite build loaded as an MV3 extension page, plus a single-thread proof without isolation headers, with malformed-witness privacy and recovery checks. It needs Chrome, and installs Chrome for Testing under `target/` for the extension, which branded Chrome no longer loads from the command line.

The opt-in devnet gate drives the wallet example in Chrome: a fresh key registers, shields, sends privately, sends with an app fee and unshields through the published SDK, and every proof must be made in the page:

```sh
npm run build:prover
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=$API_KEY" \
npm run test:devnet
```

Use a keyed RPC; the public devnet endpoint rate-limits confirmation polling. The gate needs the example on `@heliuslabs/zolana` 0.5.0-alpha, which devnet-d and the pinned keys serve.

### Proof timing

The same table the mobile SDK reports, from the browser: `examples/browser/scripts/proof-timing.mjs` drives the benchmark page in headless Chrome through four scenarios per shape (first run including the key's fetch and decode, warm, first run after a page reload with the key in the raw-key cache, repeated) and prints one `ZOLANA_TIMING {json}` line per proof; `scripts/proof-timing-report.mjs` turns the lines into the report, with the change against a baseline. The shapes are transfers of 1, 2, 4, 8, 16 and 24 notes to two outputs (`1x2` to `24x2`) and a merge of 24 notes (`merge-24x1`); a shape that fails shows as failed and the others still run.

CI benches every shape on every pull request, beside the checks, in headless Chrome against one build of the page, on two runners with their own processors: Linux, a 4-core server VM (AMD EPYC), says whether a change made proving faster or slower, and macOS, a 3-core Apple M1 VM, is the nearest to a laptop. One comment shows the proof time by runner and each runner's tables below it. The Linux runner's times are compared with `main`'s last report on the same processor type, since a hosted runner lands on several and one commit takes up to twice as long on one as on another; the macOS VM varies that much between runs of one commit on one processor, so its times are shown, not compared. After each push to `main` the report is commented on the commit, against the commit before it, and joins the history on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch, a table of the last commits per runner. Those numbers say whether a change made proving faster or slower on a runner; what a laptop takes comes from the same harness on that laptop.

```sh
ZOLANA_TIMING_SHAPES=1x2,8x2 ZOLANA_TIMING_DIR=/tmp/timing node examples/browser/scripts/proof-timing.mjs
node scripts/proof-timing-report.mjs --logs /tmp/timing
```

The lines land in `/tmp/timing/<label>/` (`chrome-linux`, `chrome-macos` or `chrome-windows` unless `ZOLANA_TIMING_LABEL` names the machine), beside a `runner.json` with the browser, system, processor, memory and thread count; `ZOLANA_TIMING_BUILT=1` times the built page (`npm run build:example`) instead of the dev server.

The requests are `fixtures/transfer-*.json` and `merge-*.json`, valid witnesses on trees of their own (zk-tools' `zopro/tools/zolana/fixtures` at the pinned revision). Keys load from where the page loads them, so set `VITE_ZOLANA_KEYS_URL` to the key CDN for shapes not staged under `public/keys`. `ZOLANA_TIMING_ROUNDS` (4, and 2 for shapes over 8 notes) is the proofs per shape and run; `ZOLANA_TIMING_THREADS=4` sizes the runtime's thread pool as on a four-core laptop, and `ZOLANA_TIMING_CHROME_ARGS=--disable-features=WebGPU` times the CPU alone.

### GPU profile

`examples/browser/scripts/gpu-profile.mjs` proves fixtures in headless Chrome with the runtime's profiling on and prints, per proof, each WebGPU kernel's time from timestamp queries (rounded to 0.1 ms by the browser) beside the host's stages: the witness solve, the sorts, the CPU's share of the G2 MSM and the waits. Run it after `npm run setup`; `ZOLANA_PROFILE_SHAPES`, `ZOLANA_PROFILE_THREADS` and `ZOLANA_PROFILE_ROUNDS` choose what it proves.

## Runtime and keys

`runtime.lock.json` pins the zopro repository and revision the runtime is built from, with the Rust toolchain and the wasm-bindgen version. `scripts/build-runtime.sh` (`npm run build:runtime`, and the package build) builds zopro-zolana for the browser into the package's `src/runtime` with a manifest of every file's size and SHA-256, and keeps a runtime already built from the pins; the package ships it beside the compiled worker. The build uses Rayon's thread helpers for bundlers, zopro's default; its `no-bundler` feature builds the helpers for pages without one, which start their threads from `blob:` URLs that extension pages refuse. A new runtime is a new pinned revision.

The keys are zopro keys: one file per circuit with the gnark proving key's points, the circuit's solver program, its input names and its verifying key, built offline from the gnark keys of the pinned key set with zopro's `tools/gnark/build-keys.sh`. `zopro-keys.lock` pins each file's size and SHA-256 beside the SHA-256 of the gnark key it was built from, which proofs report, and the CDN folder they are served from; the package's key digests and shape table are generated from it at build and test time, and `scripts/check-upstream.sh` checks it against the pinned zolana release (see [UPSTREAM.md](UPSTREAM.md)).

## Releasing the package

A release is a pull request that sets `packages/web-prover/package.json`'s version and dates its `CHANGELOG.md` entry. After it merges, push the tag from `main`:

```sh
git tag web-prover-v0.4.0-alpha && git push origin web-prover-v0.4.0-alpha
```

The `Publish` workflow runs the checks and the consumer gate, refuses a tag that does not name the package's version, and publishes with provenance as `latest`. It authenticates through npm's trusted publishing, which the package's settings on npmjs.com must name: GitHub Actions, `helius-labs/zolana-web-sdk`, workflow `publish.yml`.

## SDK

Install the package and import it: the app's bundler (Vite or webpack 5) emits the worker and the runtime from it, and proving keys load from the key CDN on first use. See the [package guide](packages/web-prover/README.md) for headers, extension pages, key hosting, integrity, error codes and lifecycle behavior. To serve keys yourself, `npx zolana-prover-keys --output public/keys --keys transfer_confidential_1_2.key,transfer_confidential_2_2.key` installs the zopro key files of the shapes you name, checked against the lockfile; only one deserialized key is resident, but downloaded keys consume storage and proving requires additional working memory.

```ts
import { ZolanaWebProver } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({ proverUrl: "http://localhost:3001" });

const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
const localFetch = prover.createFetch();
```

The worker starts automatically on first use. Pass an `AbortSignal` to cancel queued or active work. Active cancellation discards the runtime and its queue; later requests can restart through the retained factory. `terminate()` releases the runtime and clears that factory, so create a new instance or explicitly call `start(factory)` afterward.
