# Zolana Web SDK

Local Zolana Groth16 proving in the browser: `@heliuslabs/zolana-web-prover`, a private wallet example that proves every transaction in the page, and a prover benchmark.

**Performance.** With the zopro runtime in Chrome at four threads on an Apple M5 Pro, with WebGPU, a warm proof (key loaded, nothing to download) takes 0.06 s for one note to two outputs, 0.08 s for two, 0.12 s for four, 0.18 s for eight, 0.32 s for sixteen and 0.49 s for twenty-four. Without WebGPU the CPU alone takes 0.28 s for two notes, 0.87 s for eight and 2.6 s for twenty-four. The first proof after a page reload adds the key's load from the raw-key cache (0.02 s to 0.32 s). The first ever adds its download (7 MB to 145 MB) and its decode (1 s to 17 s). CI benches every pull request on four-core runners and keeps the history of `main` on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch; "Proof timing" below describes the harness.

## Packages

- `@heliuslabs/zolana-web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- [`examples/wallet`](examples/wallet/README.md) is the integration example: a devnet private wallet on the published `@heliuslabs/zolana@0.4.0-alpha` that registers, shields, sends privately and unshields, with every proof made in the page. Start here.
- `examples/browser` is a prover benchmark. It proves a synthetic 2x2 transfer request, a valid witness for the real proving key whose tree roots exist on no chain, on one proof or five.
- `@heliuslabs/zolana-web-prover` matches `@heliuslabs/zolana@0.4.0-alpha`'s `/prove` requests and proving keys (see [UPSTREAM.md](UPSTREAM.md)) without depending on it.
- The prover runtime is zopro-zolana, Zolana's requests on zopro (a Rust Groth16 prover for gnark circuits), built for the browser from the zopro revision `runtime.lock.json` pins. Its keys are zopro keys built from the gnark proving keys the SDK pins, pinned in `zopro-keys.lock`.

## Setup

```sh
npm ci
npm run setup
npm run dev         # the benchmark
npm run dev:wallet  # the wallet example, after its setup in examples/wallet/README.md
```

`npm run setup` builds the prover runtime from the pinned zopro revision with Rust `nightly-2025-11-15` (the `wasm32-unknown-unknown` target and `rust-src`) and wasm-bindgen 0.2.128, bundles it in the package, then installs it with the request fixtures and the 2-input/2-output key. `ZOPRO_DIR` builds from a zopro checkout instead of a clone of the pinned revision, and `ZOLANA_KEYS_BASE_URL` takes keys from a mirror such as a `file:///.../` directory. Installed-package users need only Node.js and the asset command, not Rust.

The demo requires cross-origin isolation for the runtime's thread pool. Its Vite server already sends the required COOP/COEP headers.

## Validation

```sh
npm run check
npm run test:browser
npm run test:consumer
```

The browser test starts and stops its own Vite server. CI runs only these hermetic gates; the wallet example's devnet test (`npm run test:devnet` in `examples/wallet`), run by hand with a funded key, is the end-to-end check with requests the SDK builds, every proof made in the page and landed on-chain. Set `DEMO_URL` only when testing an already-running deployment.


The consumer gate packs the prover, installs it outside the workspace without protocol/Solana packages, checks strict TypeScript with `skipLibCheck: false` in NodeNext and bundler modes, and runs production-built proofs at one and two threads with malformed-witness privacy and recovery checks. It needs Chrome and the 2x2 key.

### Proof timing

The same table the mobile SDK reports, from the browser: `examples/browser/scripts/proof-timing.mjs` drives the benchmark page in headless Chrome through four scenarios per shape (first run including the key's fetch and decode, warm, first run after a page reload with the key in the raw-key cache, repeated) and prints one `ZOLANA_TIMING {json}` line per proof; `scripts/proof-timing-report.mjs` turns the lines into the report, with the change against a baseline. The shapes are transfers of 1, 2, 4, 8, 16 and 24 notes to two outputs (`1x2` to `24x2`) and a merge of 24 notes (`merge-24x1`); a shape that fails shows as failed and the others still run.

CI benches every shape on every pull request, beside the checks, in headless Chrome against one build of the page, on two runners with their own processors: Linux, a 4-core server VM (AMD EPYC), says whether a change made proving faster or slower, and macOS, a 3-core Apple M1 VM, is the nearest to a laptop. One comment shows the proof time by runner, with the change against the last commit of `main`, and each runner's tables below it. After each push to `main` the report is commented on the commit, against the commit before it, and joins the history on the [`proof-timing`](https://github.com/helius-labs/zolana-web-sdk/tree/proof-timing) branch, a table of the last commits per runner. Those numbers say whether a change made proving faster or slower on a runner; what a laptop takes comes from the same harness on that laptop.

```sh
ZOLANA_TIMING_SHAPES=1x2,8x2 ZOLANA_TIMING_DIR=/tmp/timing node examples/browser/scripts/proof-timing.mjs
node scripts/proof-timing-report.mjs --logs /tmp/timing
```

The lines land in `/tmp/timing/<label>/` (`chrome-linux`, `chrome-macos` or `chrome-windows` unless `ZOLANA_TIMING_LABEL` names the machine), beside a `runner.json` with the browser, system, processor, memory and thread count; `ZOLANA_TIMING_BUILT=1` times the built page (`npm run build:example`) instead of the dev server.

The requests are `fixtures/transfer-*.json` and `merge-*.json`, valid witnesses on trees of their own (the mobile SDK's `tools/prove-fixtures` wrote them). Keys load from where the page loads them, so set `VITE_ZOLANA_KEYS_URL` to the key CDN for shapes not staged under `public/keys`. `ZOLANA_TIMING_ROUNDS` (4, and 2 for shapes over 8 notes) is the proofs per shape and run; `ZOLANA_TIMING_THREADS=4` sizes the runtime's thread pool as on a four-core laptop, and `ZOLANA_TIMING_CHROME_ARGS=--disable-features=WebGPU` times the CPU alone.

### GPU profile

`examples/browser/scripts/gpu-profile.mjs` proves fixtures in headless Chrome with the runtime's profiling on and prints, per proof, each WebGPU kernel's time from timestamp queries (rounded to 0.1 ms by the browser) beside the host's stages: the witness solve, the sorts, the CPU's share of the G2 MSM and the waits. Run it after `npm run setup`; `ZOLANA_PROFILE_SHAPES`, `ZOLANA_PROFILE_THREADS` and `ZOLANA_PROFILE_ROUNDS` choose what it proves.

## Runtime and keys

`runtime.lock.json` pins the zopro repository and revision the runtime is built from, with the Rust toolchain and the wasm-bindgen version. `scripts/build-runtime.sh` (`npm run build:runtime`) builds zopro-zolana for the browser into `dist/runtime` with a manifest of every file's size and SHA-256; the package bundles it and the asset command checks each file against the manifest as it installs it. A new runtime is a new pinned revision.

The keys are zopro keys: one file per circuit with the gnark proving key's points, the circuit's solver program, its input names and its verifying key, built offline from the gnark keys of the pinned key set with zopro's `tools/gnark/build-keys.sh`. `zopro-keys.lock` pins each file's size and SHA-256 beside the SHA-256 of the gnark key it was built from, which proofs report, and the CDN folder they are served from; `scripts/check-upstream.sh` checks it against the pinned zolana release (see [UPSTREAM.md](UPSTREAM.md)).

## SDK

For an installed package without this repository, run `npx --no-install zolana-prover-assets --output public`. See the [package guide](packages/web-prover/README.md) for asset hosting, integrity, supported bundlers, error codes and lifecycle behavior. The runtime ships in the package; proving keys are downloaded only when you explicitly run the asset command, or by the page on first use.

The default key is demo-only 2x2. For real transfers, explicitly select the needed locked shapes, for example `--keys transfer_confidential_1_2.key,transfer_confidential_2_2.key`. This replaces the default selection; only one loaded key is resident, but downloaded keys consume storage and proving requires additional working memory.

```ts
import { ZolanaWebProver } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({
  runtimeUrl: "/prover/",
  keyBaseUrl: "/keys",
  proverUrl: "http://localhost:3001",
});

const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
const localFetch = prover.createFetch();
```

The worker starts automatically on first use. Pass an `AbortSignal` to cancel queued or active work. Active cancellation discards the runtime and its queue; later requests can restart through the retained factory. `terminate()` releases the runtime and clears that factory, so create a new instance or explicitly call `start(factory)` afterward.

Flow, submission and benchmark helpers are in `examples/browser/src/{flow,submit,bench,sweep-amounts}.ts`; they are intentionally no longer core exports.
