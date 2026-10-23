# @heliuslabs/zolana-web-prover

Local Groth16 proving and gnark verification in a browser worker. The core package has no protocol SDK or Solana dependencies. Transaction building, submission and benchmark orchestration live in the repository's browser example, not this package.

## Install

```sh
npm install @heliuslabs/zolana-web-prover
```

The package contains the worker and the prover runtime: zopro-zolana built for the browser, one WebAssembly module that turns a `/prove` request into the circuit's witness, proves on a thread pool (and on WebGPU where the browser offers it) and verifies the proof before it returns it. Import it, and the app's bundler emits the runtime's module, its wasm and its thread helpers as files beside the worker; the packed-consumer CI builds an app with Vite and with webpack 5 and proves from both. A bundler that does not emit `new URL(…, import.meta.url)` assets and nested module workers (esbuild and Rollup without plugins) cannot load the runtime. Keys load on first use from the pinned key set on the Zolana key CDN, which serves them with CORS, and are checked against the size and SHA-256 bundled in the package, so an app installs none.

Serve the document with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Use HTTPS (localhost is suitable for development). The runtime's thread pool shares memory between workers, so these headers are required: without cross-origin isolation the prover does not start. `threads` sizes the pool (one or more; by default the browser's processors, at most 18). Every key is checked against the size and SHA-256 bundled in the package from the pinned `zopro-keys.lock`, so the key host does not need to be trusted for integrity.

In a Chrome extension, prove from an extension page; an extension's service worker cannot start workers. Give the manifest the same isolation and allow WebAssembly:

```json
"cross_origin_embedder_policy": { "value": "require-corp" },
"cross_origin_opener_policy": { "value": "same-origin" },
"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }
```

The packed-consumer CI proves from such a page at one and two threads.

## Prove locally

```ts
import { ZolanaWebProver, WasmProverError } from "@heliuslabs/zolana-web-prover";

const prover = new ZolanaWebProver({
  proverUrl: "http://127.0.0.1:3001",
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

`proveRequest` accepts the protocol's `/prove` JSON string and returns its proof JSON only after the runtime verified it with the key's verifying key. No transaction is built or sent. The runtime proves requests from `@heliuslabs/zolana` 0.5.0-alpha, transfers and merges of up to 24 notes (`MAX_BROWSER_MERGE_INPUTS`; the 52-note merge key does not fit in wasm32's 4 GB of memory beside its cached raw form, and a wider merge fails with `wasm_merge_too_wide`), and reports each proof's `provingKeySha256`, the gnark proving key's that the zopro key was built from, which that SDK checks against its pinned keys. A proof made on the GPU that does not verify is proved again on the CPU, which proves that key from then on. To connect it, pass `prover.createFetch()` as `fetch`, set `proofDataSource: "client"`, and pass the same `proverUrl` to `createZolanaClient`, then prove through `LocalKeys.fromKeypair(keypair, client.proofService)`, or, for a browser wallet, `LocalKeys.fromDerivationSeed` with the wallet's signature over `ed25519DerivationMessage(publicKey)` (the repository's [wallet example](https://github.com/helius-labs/zolana-web-sdk/tree/main/examples/wallet) shows the whole flow). Use a loopback `proverUrl`: `@heliuslabs/zolana` 0.5.0-alpha sends a loopback prover plaintext, which `createFetch()` answers, and encrypts calls to any other prover for its attested enclave, which `createFetch()` cannot read. Requests to that URL's `/prove/<key>` endpoint, and to the bare `/prove` the Helius gateway routes to, are proved locally with the key the request names; a `<key>` that does not match the request body and any other path below `/prove` (such as `/prove/<key>/indexed`) get a 500 and are never forwarded. All other requests are delegated to the configured fetch implementation.

## Self-host proving keys

To serve keys yourself, for offline use, a mirror or your own CDN, install the shapes your application's requests need and pass their location as `keyBaseUrl` (for example `keyBaseUrl: "/keys"`):

```sh
npx --no-install zolana-prover-keys --output public/keys --keys transfer_confidential_1_2.key,transfer_confidential_2_2.key
```

A key is named after the gnark proving key it was built from, and installs as `<name>.zopro`. Names must be confidential-transfer or merge keys present in the pinned `zopro-keys.lock`; arbitrary names, paths and unsupported circuits are rejected before installation. Bytes still undergo size and SHA-256 checks. Use `keyForProveRequest` or `observeProofRequests` to identify needed shapes without logging witness bodies. A missing key fails rather than substituting a different circuit. Previously downloaded files are not deleted when selecting a new list. The command needs Node.js and network access; for a local mirror of the key set, set `ZOLANA_KEYS_BASE_URL` to a `file:///.../` directory, and the same checks apply.

Keys are 7–302 MB each for confidential transfers (12 MB for 2x2, 73 MB for 12x8) and 42–140 MB for merge; a loaded key and its proofs need additional memory. Only one loaded key is retained, and changing shapes reloads it. The first load of a shape decompresses the key's curve points and builds its solver, which takes a second or more in wasm (1.5 s for 2x2), and stores the result, the raw form, in the browser Cache API in place of the downloaded file; later loads, including after a reload, read the raw form in a few tens of milliseconds (0.03 s for 2x2); it is checked by size, not hashed again, since a damaged entry fails its load and is rebuilt from the pinned key. The raw form is about three times the file's size, and storage is subject to the browser's quota. Keys live in the Cache API store `zolana-proving-keys-<key set>`, and stores left by other key sets are deleted on first use. Pass `persistStorage: true` to ask the browser not to evict them under storage pressure (`navigator.storage.persist()`; Firefox asks the user). Install only the shapes you use, and budget separately for download/storage size and runtime memory.

A key downloads in ranged parts of 8 MB, each kept in the cache as it arrives, so a download that a closed tab, a lost connection or an abort interrupted resumes where it stopped; a host that ignores ranges sends the whole key instead. The key is checked against the lockfile once it is whole, and a download that resumed from a damaged part starts over once.

## Prefetch keys

`prefetch` downloads, checks and decodes keys ahead of the proofs that need them, for example right after a wallet connects, so the first send doesn't wait seconds for its key. Shapes whose decoded form is already cached are skipped, and a proof requested meanwhile runs after the shape in progress:

```ts
await prover.prefetch({
  shapes: [shapeByLabel("1x2"), shapeByLabel("2x2")],
  onProgress: ({ keyFile, stage, loaded, total }) => render(keyFile, stage, loaded / total),
});
```

`stage` is `download` while bytes arrive and `decode` once the worker starts loading the key. Pass `onKeyProgress` to the constructor to receive the same events for every load, including the ones a proof triggers. Without the Cache API only the last prefetched shape stays loaded.

`neededKeys(maxInputs, outputs, maxMergeInputs)` names the shapes that spends of up to `maxInputs` notes with `outputs` outputs, and merges of up to `maxMergeInputs` notes (at most 24), prove with, smallest first, for `prefetch`; a transfer has two outputs, the payment and the change. `provingKeys()` lists every key the prover can load with its size, the bytes the browser keeps of it and whether its decoded form is kept, without starting the worker. `clearKeys()` removes the kept keys, their decoded forms and interrupted downloads after any work in progress. These follow the mobile SDK's `ProvingKeys.needed`, `status` and `clear`:

```ts
const shapes = neededKeys(8, [2], 24); // spends of up to 8 notes, merges of up to 24
await prover.prefetch({ shapes });
const kept = (await prover.provingKeys()).reduce((sum, key) => sum + key.downloaded, 0);
```

## Lifecycle and failures

- First use initializes the worker automatically. Requests are serialized; only one loaded key is resident at a time.
- Cache API access is best-effort. Cached bytes are validated; unavailable storage and quota failures fall back to validated network bytes. Abort and integrity failures remain errors.
- An `AbortSignal` cancels queued work without interrupting active work. Cancelling active work terminates the runtime and rejects its queued requests. A retained worker factory allows a later request to restart automatically after cancellation or a worker failure.
- `terminate()` rejects outstanding work, clears the factory and disables automatic restart. Create a new prover, or explicitly call `start(factory)` to reuse the object. A supplied single `Worker` cannot be recreated automatically.
- `WasmProverError.code` and its fixed message identify failures without serializing backend messages, witness values, causes or stacks from the backend. Core code does not log errors. The fetch adapter returns a JSON 500 with the safe `code` and `message`; cancellation rejects instead. Caller-provided abort reasons and callback errors remain caller-controlled and should not contain secrets.

The runtime is built from the zopro revision the repository's `runtime.lock.json` pins, with Rayon's thread helpers for bundlers, and ships in the package. The worker sends only error codes across its boundary, and the API redacts anything else as defense in depth.
