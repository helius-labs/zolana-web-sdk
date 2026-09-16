# Zolana Web SDK

Standalone browser SDK for producing Zolana Groth16 proofs locally, plus the Arkworks browser demo and a snapshot of the TypeScript protocol SDK it uses.

## Packages

- `@zolana/web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- `@heliuslabs/zolana` is the matching upstream TypeScript SDK snapshot used only by the example's transaction helpers; it is not a dependency of the packed prover.
- `examples/browser` is the focused Arkworks UI for generating one proof or benchmarking five proofs locally.
- `wasm` is a self-contained Go module for the browser prover bridge.

## Setup

```sh
npm ci
npm run setup
npm run dev
```

`npm run setup` builds the sanitized Go bridge with Go 1.25.7, then downloads and verifies the pinned accelerator, the 2-input/3-output proving key, and the demo request fixture. Source builds require Go; installed-package users need only Node.js and the asset command, not Go, Rust, Mopro or `wasm-pack`. Setup never restores the old pinned release's Go Wasm or shim.

The demo requires cross-origin isolation for the threaded Mopro kernel. Its Vite server already sends the required COOP/COEP headers.

## Validation

```sh
npm run check
npm run test:browser
npm run test:consumer
```

The browser test starts and stops its own Vite server. Set `DEMO_URL` only when testing an already-running deployment.

The consumer gate packs the prover, installs it outside the workspace without protocol/Solana packages, checks strict TypeScript with `skipLibCheck: false` in NodeNext and bundler modes, and runs production-built Go and Arkworks proofs with malformed-witness privacy and recovery checks. It needs Chrome and the staged runtime/key assets. Existing protocol, Go, example and browser gates remain enabled.

## Runtime releases

The accelerator runtime is built by maintainers and published as a versioned GitHub release. `runtime.lock.json` pins the release manifest by SHA-256, while the manifest pins every downloaded runtime file. The Go bridge and matching shim are rebuilt from this repository for each SDK build and bundled in the npm artifact; setup ignores their older release copies. Proving keys are fetched from their immutable CloudFront prefix and checked against `wasm/prover/provingkeys/proving-keys.lock`.

To rebuild runtime assets manually, use the pinned Mopro checkout and the committed build script:

```sh
git clone https://github.com/sergeytimoshin/mopro.git /tmp/mopro
git -C /tmp/mopro checkout 2bb184c23463d6415ebb5c9110bfd779df910d2f
npm run build:runtime -- 0.1.0 /tmp/mopro
```

Maintainers can run the `Runtime release` GitHub Actions workflow instead. After publishing a new runtime, update the version, release URL, size, and SHA-256 in `runtime.lock.json` before changing the SDK default.

For local development with already-built Mopro bindings and keys, `npm run stage:assets -- <MoproWasmBindings> <keys-directory> <transfer-2x3.json>` remains available.

## SDK

For an installed package without this repository, run `npx --no-install zolana-prover-assets --output public`. See the [package guide](packages/web-prover/README.md) for asset hosting, integrity, supported bundlers, error codes and lifecycle behavior. The sanitized Go bridge ships in the package; the accelerator and proving keys are downloaded only when you explicitly run the asset command.

The default key is demo-only 2x3. For real transfers, explicitly select the needed locked shapes, for example `--keys transfer_confidential_1_2.key,transfer_confidential_2_3.key`. This replaces the default key-manifest selection; only one deserialized key is resident, but downloaded keys consume storage and proving requires additional working memory.

```ts
import { ZolanaWebProver } from "@zolana/web-prover";

const prover = new ZolanaWebProver({
  wasmUrl: "/prover/zolana-prover.wasm",
  keyBaseUrl: "/keys",
  proverUrl: "http://localhost:3001",
});

const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
const localFetch = prover.createFetch();
```

The worker starts automatically on first use. Pass an `AbortSignal` to cancel queued or active work. Active cancellation discards the runtime and its queue; later requests can restart through the retained factory. `terminate()` releases the runtime and clears that factory, so create a new instance or explicitly call `start(factory)` afterward.

Flow, submission and benchmark helpers are in `examples/browser/src/{flow,submit,bench,sweep-amounts}.ts`; they are intentionally no longer core exports. The vendored protocol package is unchanged. The pinned accelerator release remains unchanged; builds package the sanitized Go bridge locally, without publishing or replacing a remote release.
