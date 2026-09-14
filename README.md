# Zolana Web SDK

Standalone browser SDK for producing Zolana Groth16 proofs locally, plus the original browser demo and a snapshot of the TypeScript protocol SDK it uses.

## Packages

- `@zolana/web-prover` owns the worker lifecycle, proving-key cache, request interception, cancellation, local proof generation, and native verification.
- `@heliuslabs/zolana` is the matching upstream TypeScript SDK snapshot.
- `examples/browser` demonstrates shield, transfer, unshield, local proving, and benchmark flows.
- `wasm` is a self-contained Go module for the browser prover bridge.

## Setup

```sh
npm install
npm run build:wasm
npm run stage:assets -- /path/to/MoproWasmBindings /path/to/proving-keys /path/to/transfer-2x3.json
npm run dev
```

The demo requires cross-origin isolation for the threaded Mopro kernel. Its Vite server already sends the required COOP/COEP headers.

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
