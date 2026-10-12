# Private wallet with local proving

A devnet private wallet where every zero-knowledge proof is made in the browser by `@heliuslabs/zolana-web-prover`: register, shield SOL, send it privately, unshield it, and read the private history through `@heliuslabs/zolana`.

The whole integration is in [`src/zolana.ts`](src/zolana.ts):

```ts
const prover = new ZolanaWebProver({ wasmUrl: "/prover/zolana-prover.wasm", keyBaseUrl: "/keys", proverUrl });
const client = await createZolanaClient({
  solanaRpcUrl, indexerUrl, proverUrl,
  proofDataSource: "client",
  fetch: prover.createFetch(), // proof requests are answered in the page
});
const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey, derivationSeed }, client.proofService);
```

The signer is a devnet-only key kept in `localStorage`, standing in for a wallet extension. Swapping in a wallet means replacing `signer`: it signs each transaction and, once, the SDK's derivation message (`ed25519DerivationMessage`) that `derivationSeed` is the signature of.

## Run

From the repository root:

```sh
npm ci
npm run build:prover
npm run assets --workspace @zolana/wallet-example
VITE_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" npm run dev --workspace @zolana/wallet-example
```

Open http://127.0.0.1:5179, fund the shown address with devnet SOL, then register and shield. `assets` installs the prover runtime and the 1x2, 2x2, 3x2, 1x4 and 2x4 transfer keys into `public/`, the shapes small wallets use; the page loads each key on first use. The page must be served with the cross-origin isolation headers in `vite.config.ts` for threaded proving.

Without `VITE_SOLANA_RPC_URL` the page uses the public devnet RPC, which rate-limits confirmations. `VITE_INDEXER_URL` and `VITE_PROVER_URL` default to the devnet services; only the prover's non-proving routes are ever called.

## Test

```sh
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
VITE_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" \
npm run test:devnet --workspace @zolana/wallet-example
```

Drives the page in Chrome with a fresh key the funder tops up with 0.05 devnet SOL: register, shield, send privately and unshield, failing unless the transfer and withdrawal are proved in the page. The key returns what is left to the funder.
