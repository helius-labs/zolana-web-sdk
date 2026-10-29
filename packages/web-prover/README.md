# @heliuslabs/zolana-web-prover

Local Groth16 proving in a browser worker. No protocol SDK or Solana dependencies — transaction building stays in your app (see the [wallet example](https://github.com/helius-labs/zolana-web-sdk/tree/main/examples/wallet)).

## Install

```sh
npm install @heliuslabs/zolana-web-prover
```

Use a bundler that emits `new URL(..., import.meta.url)` assets and nested module workers (Vite and webpack 5 work; plain esbuild/Rollup usually do not). Keys load from the Zolana key CDN on first use and are checked against digests shipped in the package.

## Isolation and threads

For a thread pool (`threads` ≥ 1, defaulting to the machine’s processors up to 18), serve the page with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Use HTTPS (localhost is fine in development).

Set `threads: 0` when you cannot isolate (OAuth/dApp popups, Firefox, Safari, Firefox extension pages): a second runtime proves without SharedArrayBuffer. Slower, but it runs. Key decompress still fans out across ordinary workers.

In Chrome 137+, `Document-Isolation-Policy: isolate-and-credentialless` also enables `crossOriginIsolated` without classic COOP/COEP, so threaded proving can keep working with popups.

### Chrome extension

Prove from an extension page (not the service worker). For threaded proving, set isolation in the manifest and allow Wasm; or use `threads: 0`:

```json
"cross_origin_embedder_policy": { "value": "require-corp" },
"cross_origin_opener_policy": { "value": "same-origin" },
"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }
```

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

`proveRequest` takes a `/prove` JSON body and returns proof JSON after local verification. Supports `@heliuslabs/zolana` 0.6.0-alpha transfers and merges of up to 24 notes (`MAX_BROWSER_MERGE_INPUTS`). Each proof includes `provingKeySha256` for the SDK’s key pin check. If a GPU proof fails verification, the same request is retried on the CPU.

### With `@heliuslabs/zolana`

`ZOLANA_DEPLOYMENTS.devnet` selects devnet-e;
`ZOLANA_DEPLOYMENTS.mainnet` selects mainnet. Each includes a Solana RPC default,
Photon, Nitro and the deployment's trusted `proverTee` policy:

```ts
import { ZOLANA_DEPLOYMENTS } from "@heliuslabs/zolana-web-prover";
import { createZolanaClient } from "@heliuslabs/zolana";

const client = await createZolanaClient({
  ...ZOLANA_DEPLOYMENTS.mainnet,
  solanaRpcUrl: "https://your-mainnet-rpc",
});
```

For local proofs, override `proverUrl` with the prover's loopback URL and use
the fetch configuration below; omit `proverTee` on that local client. Keep the
selected deployment's policy on the separate remote merge client. Policies are
pinned from the reviewed v0.6.0-alpha infra manifests and are never downloaded
from the prover being verified. The new program ID is exposed in
`ZOLANA_PROGRAM_IDS`; earlier programs' notes and pending transactions require
their matching SDK and deployment.

Pass `prover.createFetch()` as `fetch`, set `proofDataSource: "client"`, and use the same loopback `proverUrl` on the client (0.6.0-alpha encrypts non-loopback prover calls for an enclave). Then prove through `LocalKeys.fromKeypair` or, in a wallet, `LocalKeys.fromDerivationSeed`. Paths under that URL’s `/prove` are answered locally; everything else is delegated.

## Self-host keys

```sh
npx --no-install zolana-prover-keys --output public/keys --keys transfer_confidential_1_2.key,transfer_confidential_2_2.key
```

Pass `keyBaseUrl` (for example `"/keys"`). Names must appear in the pinned key set; files install as `<name>.zopro` and are size/SHA-256 checked. For a local mirror, set `ZOLANA_KEYS_BASE_URL` to a `file:///.../` directory.

Keys are tens to hundreds of MB; a loaded key needs more working memory. Only one shape is resident at a time. The first load decompresses points and caches a raw form in the Cache API; later loads are much faster. Pass `persistStorage: true` to request durable storage. Downloads resume in 8 MB parts after interrupt.

## Prefetch

```ts
await prover.prefetch({
  shapes: [shapeByLabel("1x2"), shapeByLabel("2x2")],
  onProgress: ({ keyFile, stage, loaded, total }) => render(keyFile, stage, loaded / total),
});
```

`neededKeys(maxInputs, outputs, maxMergeInputs)` lists shapes for spends/merges up to those limits. `provingKeys()` / `clearKeys()` report and clear cached key bytes.

## Lifecycle

- The worker starts on first use. Work is serialized; one key is loaded at a time.
- `AbortSignal` cancels queued work; cancelling in-flight work tears down the runtime (it can restart via the retained factory).
- `terminate()` stops the worker and disables auto-restart.
- Failures surface as `WasmProverError` with a stable `code` (no witness or backend detail in the message).
