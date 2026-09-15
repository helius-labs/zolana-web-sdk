# Zolana Web SDK

Standalone browser SDK for producing Zolana Groth16 proofs locally, plus the Arkworks browser demo and a snapshot of the TypeScript protocol SDK it uses.

## Packages

- `@zolana/web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- `@heliuslabs/zolana` is the matching upstream TypeScript SDK snapshot.
- `examples/browser` is the focused Arkworks UI for generating one proof or benchmarking five proofs locally.
- `wasm` is a self-contained Go module for the browser prover bridge.

## Setup

```sh
npm ci
npm run setup
npm run dev
```

`npm run setup` downloads and verifies the pinned browser runtime, the 2-input/3-output proving key, and the demo request fixture. Example users do not need Go, Rust, Mopro, or `wasm-pack`.

The demo requires cross-origin isolation for the threaded Mopro kernel. Its Vite server already sends the required COOP/COEP headers.

## Validation

```sh
npm run check
npm run test:browser
```

The browser test starts and stops its own Vite server. Set `DEMO_URL` only when testing an already-running deployment.

## Runtime releases

The browser runtime is built once by maintainers and published as a versioned GitHub release. `runtime.lock.json` pins the release manifest by SHA-256, while the manifest pins every downloaded runtime file. Proving keys are fetched from their immutable CloudFront prefix and checked against `wasm/prover/provingkeys/proving-keys.lock`.

To rebuild runtime assets manually, use the pinned Mopro checkout and the committed build script:

```sh
git clone https://github.com/sergeytimoshin/mopro.git /tmp/mopro
git -C /tmp/mopro checkout 2bb184c23463d6415ebb5c9110bfd779df910d2f
npm run build:runtime -- 0.1.0 /tmp/mopro
```

Maintainers can run the `Runtime release` GitHub Actions workflow instead. After publishing a new runtime, update the version, release URL, size, and SHA-256 in `runtime.lock.json` before changing the SDK default.

For local development with already-built Mopro bindings and keys, `npm run stage:assets -- <MoproWasmBindings> <keys-directory> <transfer-2x3.json>` remains available.

## SDK

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

The worker starts automatically on first use. Call `terminate()` to release its runtime, or pass an `AbortSignal` to cancel queued or active work.
