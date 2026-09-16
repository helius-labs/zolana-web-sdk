# @zolana/web-prover

Local Groth16 proving and gnark verification in a browser worker. The core package has no protocol SDK or Solana dependencies. Transaction building, submission and benchmark orchestration live in the repository's browser example, not this package.

## Install and serve assets

```sh
npm install @zolana/web-prover
npx --no-install zolana-prover-assets --output public
```

The package contains the worker, the rebuilt Go Wasm bridge and its matching runtime shim. Proving keys and the threaded accelerator stay outside the core package. The asset command installs the bundled, sanitized Go bridge plus the pinned accelerator, sample request and 2-input/3-output key into your app's public directory. It checks the bundled bridge's manifest and verifies the release manifest's SHA-256 and size, then each downloaded file and key against the packaged lockfiles. It never installs the older Go bridge or shim from that release. It needs Node.js and network access, but no Go or Rust. Installation itself does not run downloads. For a local mirror, set `ZOLANA_RUNTIME_BASE_URL` and `ZOLANA_KEYS_BASE_URL` to `file:///.../` directories containing the release assets and keys respectively; the same digest checks apply.

Serve `public/prover`, `public/keys` and, for the demo, `public/fixtures` without flattening the accelerator's `snippets` directory. Serve `.wasm` as `application/wasm`, `.js` as JavaScript, and the document with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Use HTTPS (localhost is suitable for development) and a bundler that preserves the emitted module worker asset URL; the packed-consumer CI tests Vite's production build. The accelerator must remain beside `zolana-prover.wasm` at `accelerator/gnark_kernel.js`. These headers are required for threaded proving. Set `threads: 0` for Go-only proving without cross-origin isolation. Apply compatible CORS/CORP policies if you host assets on another origin. The hosted key manifest is a trust input: serve the generated, pinned `keys/manifest.json` and keys over a trusted origin, not an arbitrary caller-supplied manifest.

## Prove locally

```ts
import { ZolanaWebProver, WasmProverError } from "@zolana/web-prover";

const prover = new ZolanaWebProver({
  wasmUrl: new URL("/prover/zolana-prover.wasm", location.href).href,
  keyBaseUrl: "/keys",
  proverUrl: "https://local-prover.invalid",
});

try {
  const requestJson = await (await fetch("/fixtures/transfer-2x3.json")).text();
  const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
} catch (error) {
  if (error instanceof WasmProverError) console.error(error.code);
} finally {
  prover.terminate();
}
```

`proveRequest` accepts the protocol's `/prove` JSON string and returns its proof JSON only after local verification. No transaction is built or sent. To connect an existing protocol client, inject `prover.createFetch()` as its `fetch` and configure the same `proverUrl`. Only that URL's exact `/prove` endpoint is intercepted; other requests are delegated to the configured fetch implementation. Request bodies stay local on the intercepted path.

## Select proving keys

Without `--keys`, the asset command installs only the demo's 2x3 key. Real transfer shapes may differ (for example, 1x2). Select all shapes your application's actual requests need:

```sh
npx --no-install zolana-prover-assets --output public --keys transfer_confidential_1_2.key,transfer_confidential_2_3.key
```

`--keys` replaces the default selection and writes `keys/manifest.json` for exactly that list. Names must be supported confidential-transfer keys or `merge_8_1.key` present in the pinned proving-keys lockfile; arbitrary names, paths and unsupported circuits are rejected before installation. Bytes still undergo size and SHA-256 checks. Use `keyForProveRequest` or `observeProofRequests` to identify needed shapes without logging witness bodies. A missing key/manifest entry fails rather than substituting a different circuit. Previously downloaded files are not deleted when selecting a new list.

Keys require roughly 8–37 MB each for confidential transfers and 56 MB for merge; deserialized circuits and proving work need additional memory. Only one deserialized key is retained, and changing shapes reloads it. The browser Cache API can retain multiple validated key files subject to storage quota. Install only the shapes you use, and budget separately for download/storage size and runtime memory.

## Lifecycle and failures

- First use initializes the worker automatically. Requests are serialized; only one deserialized key is resident at a time.
- Cache API access is best-effort. Cached bytes are validated; unavailable storage and quota failures fall back to validated network bytes. Abort and integrity failures remain errors.
- An `AbortSignal` cancels queued work without interrupting active work. Cancelling active work terminates the runtime and rejects its queued requests. A retained worker factory allows a later request to restart automatically after cancellation or a worker failure.
- `terminate()` rejects outstanding work, clears the factory and disables automatic restart. Create a new prover, or explicitly call `start(factory)` to reuse the object. A supplied single `Worker` cannot be recreated automatically.
- `WasmProverError.code` and its fixed message identify failures without serializing backend messages, witness values, causes or stacks from the backend. Core code does not log errors. The fetch adapter returns a JSON 500 with the safe `code` and `message`; cancellation rejects instead. Caller-provided abort reasons and callback errors remain caller-controlled and should not contain secrets.

The accelerator/fixture asset lock remains `runtime-v0.1.0`; the Go bridge and shim from that release are intentionally ignored. Maintainer builds compile the sanitized Go source using pinned Go 1.25.7 and package it together with the matching shim. No binaries or releases are published by the build. The TypeScript worker/API boundary additionally redacts backend errors as defense in depth.
