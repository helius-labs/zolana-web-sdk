# @heliuslabs/zolana-web-prover

Local Groth16 proving and gnark verification in a browser worker. The core package has no protocol SDK or Solana dependencies. Transaction building, submission and benchmark orchestration live in the repository's browser example, not this package.

## Install and serve assets

```sh
npm install @heliuslabs/zolana-web-prover
npx --no-install zolana-prover-assets --output public --keys none
```

The package contains the worker, the rebuilt Go Wasm bridge and its matching runtime shim. Proving keys and the threaded accelerator stay outside the core package. Keys load on first use from the pinned key set on the Zolana key CDN, which serves them with CORS, and are checked against the size and SHA-256 bundled in the package, so an app installs none. The asset command installs the bundled, sanitized Go bridge and sample request plus the pinned accelerator into your app's public directory; without `--keys none` it also installs the 2-input/2-output key for self-hosting. It checks the bundled bridge's manifest and verifies the release manifest's SHA-256 and size, then each downloaded file and key against the packaged lockfiles. It never installs the older Go bridge, shim or sample request from that release. It needs Node.js and network access, but no Go or Rust. Installation itself does not run downloads. For a local mirror, set `ZOLANA_RUNTIME_BASE_URL` and `ZOLANA_KEYS_BASE_URL` to `file:///.../` directories containing the release assets and keys respectively; the same digest checks apply.

Serve `public/prover`, `public/keys` if you self-host keys, and, for the demo, `public/fixtures` without flattening the accelerator's `snippets` directory. Serve `.wasm` as `application/wasm`, `.js` as JavaScript, and the document with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Use HTTPS (localhost is suitable for development) and a bundler that preserves the emitted module worker asset URL; the packed-consumer CI tests Vite's production build. The accelerator must remain beside `zolana-prover.wasm` at `accelerator/gnark_kernel.js`. These headers are required for threaded proving. Set `threads: 0` for Go-only proving without cross-origin isolation. Apply compatible CORS/CORP policies if you host assets on another origin. Every key is checked against the size and SHA-256 bundled in the package from the pinned proving-keys lockfile, so the key host does not need to be trusted for integrity.

## Prove locally

```ts
import { ZolanaWebProver, WasmProverError } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({
  wasmUrl: new URL("/prover/zolana-prover.wasm", location.href).href,
  proverUrl: "https://local-prover.invalid",
});

try {
  const requestJson = await (await fetch("/fixtures/transfer-2x2.json")).text();
  const { proof, proveMs, verifyMs } = await prover.proveRequest(requestJson);
} catch (error) {
  if (error instanceof WasmProverError) console.error(error.code);
} finally {
  prover.terminate();
}
```

`proveRequest` accepts the protocol's `/prove` JSON string and returns its proof JSON only after local verification. No transaction is built or sent. The bridge proves requests from `@heliuslabs/zolana` 0.4.0-alpha and reports each proof's `provingKeySha256`, which that SDK checks against its pinned keys. To connect it, pass `prover.createFetch()` as `fetch` and the same `proverUrl` to `createZolanaClient`, then prove through `LocalKeys.fromKeypair(keypair, client.proofService)`, or, for a browser wallet, `LocalKeys.fromDerivationSeed` with the wallet's signature over `ed25519DerivationMessage(publicKey)` (the repository's [wallet example](https://github.com/helius-labs/zolana-web-sdk/tree/main/examples/wallet) shows the whole flow). Requests to that URL's `/prove/<key>` endpoint, and to the bare `/prove` the Helius gateway routes to, are proved locally with the key the request names; a `<key>` that does not match the request body and any other path below `/prove` (such as `/prove/<key>/indexed`) get a 500 and are never forwarded. All other requests are delegated to the configured fetch implementation.

## Self-host proving keys

To serve keys yourself, for offline use, a mirror or your own CDN, install the shapes your application's requests need and pass their location as `keyBaseUrl` (for example `keyBaseUrl: "/keys"`). Without `--keys`, the asset command installs only the demo's 2x2 key; real transfer shapes may differ (for example, 1x2):

```sh
npx --no-install zolana-prover-assets --output public --keys transfer_confidential_1_2.key,transfer_confidential_2_2.key
```

`--keys` replaces the default selection. Names must be confidential-transfer or merge keys present in the pinned proving-keys lockfile; arbitrary names, paths and unsupported circuits are rejected before installation. Bytes still undergo size and SHA-256 checks. Use `keyForProveRequest` or `observeProofRequests` to identify needed shapes without logging witness bodies. A missing key fails rather than substituting a different circuit. Previously downloaded files are not deleted when selecting a new list.

Keys are 9–362 MB each for confidential transfers (16 MB for 2x2, 94 MB for 12x8) and 56–380 MB for merge; deserialized circuits and proving work need additional memory. Only one deserialized key is retained, and changing shapes reloads it. The first load of a shape decompresses the key's curve points, which takes seconds in wasm (about 4 s for 2x2), and stores the decoded raw form in the browser Cache API in place of the downloaded file; later loads, including after a reload, read the raw form in about a tenth of a second (2x2). The raw form is about 1.6× the file's size, and storage is subject to the browser's quota. Keys live in the Cache API store `zolana-proving-keys-<key set>`, and stores left by other key sets are deleted on first use. Pass `persistStorage: true` to ask the browser not to evict them under storage pressure (`navigator.storage.persist()`; Firefox asks the user). Install only the shapes you use, and budget separately for download/storage size and runtime memory.

## Prefetch keys

`prefetch` downloads, checks and decodes keys ahead of the proofs that need them, for example right after a wallet connects, so the first send doesn't wait seconds for its key. Shapes whose decoded form is already cached are skipped, and a proof requested meanwhile runs after the shape in progress:

```ts
await prover.prefetch({
  shapes: [shapeByLabel("1x2"), shapeByLabel("2x2")],
  onProgress: ({ keyFile, stage, loaded, total }) => render(keyFile, stage, loaded / total),
});
```

`stage` is `download` while bytes arrive and `decode` once the worker starts loading the key. Pass `onKeyProgress` to the constructor to receive the same events for every load, including the ones a proof triggers. Without the Cache API only the last prefetched shape stays loaded.

## Lifecycle and failures

- First use initializes the worker automatically. Requests are serialized; only one deserialized key is resident at a time.
- Cache API access is best-effort. Cached bytes are validated; unavailable storage and quota failures fall back to validated network bytes. Abort and integrity failures remain errors.
- An `AbortSignal` cancels queued work without interrupting active work. Cancelling active work terminates the runtime and rejects its queued requests. A retained worker factory allows a later request to restart automatically after cancellation or a worker failure.
- `terminate()` rejects outstanding work, clears the factory and disables automatic restart. Create a new prover, or explicitly call `start(factory)` to reuse the object. A supplied single `Worker` cannot be recreated automatically.
- `WasmProverError.code` and its fixed message identify failures without serializing backend messages, witness values, causes or stacks from the backend. Core code does not log errors. The fetch adapter returns a JSON 500 with the safe `code` and `message`; cancellation rejects instead. Caller-provided abort reasons and callback errors remain caller-controlled and should not contain secrets.

The accelerator comes from the `runtime-v0.2.0` release; the Go bridge is rebuilt from source and bundled, so that release's older bridge, shim and sample request are ignored. The TypeScript worker/API boundary additionally redacts backend errors as defense in depth.
