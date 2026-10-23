# Private wallet with local proving

A private wallet on devnet-d, Zolana's devnet deployment of v0.5.0-alpha, where every zero-knowledge proof is made in the browser by `@heliuslabs/zolana-web-prover`: register, shield SOL, send it privately, unshield it, and read the private history through `@heliuslabs/zolana`.

The whole integration is in [`src/zolana.ts`](src/zolana.ts):

```ts
const prover = new ZolanaWebProver({ proverUrl }); // the bundler emits the runtime; keys come from the key CDN
const client = await createZolanaClient({
  solanaRpcUrl, indexerUrl, proverUrl,
  proofDataSource: "client",
  fetch: prover.createFetch(), // proof requests are answered in the page
});
const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey, derivationSeed }, client.proofService);
```

The signer is a devnet-only key kept in `localStorage`, standing in for a wallet extension. Swapping in a wallet means replacing `signer`: it signs each transaction and, once, the SDK's derivation message (`ed25519DerivationMessage`) that `derivationSeed` is the signature of.

## Pay a recipient and an app fee in one transfer

With an app fee filled in, Send pays the recipient and the fee collector as two private outputs of one transfer, proved once, through `buildMultiTransferTransaction`.

## Run

From the repository root:

```sh
npm ci
npm run build:prover
VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=<key>" npm run dev --workspace @zolana/wallet-example
```

Open http://127.0.0.1:5179, fund the shown address with devnet SOL, then register and shield. Vite emits the prover's worker and runtime from the package; proving keys load on first use from the Zolana key CDN, checked against the digests bundled in the prover, and the page prefetches the 1x2 and 2x2 keys once it connects. The page must be served with the cross-origin isolation headers in `vite.config.ts`, without which the prover does not start.

Without `VITE_SOLANA_RPC_URL` the page uses the public devnet RPC, which rate-limits confirmations. `VITE_INDEXER_URL` defaults to devnet-d's indexer, directly until the Helius gateway serves devnet-d. The prover URL is loopback: the SDK sends a loopback prover plaintext, which the page's prover answers, and encrypts requests to any other prover for its enclave, which the page cannot read.

## Test

```sh
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=<key>" \
npm run test:devnet --workspace @zolana/wallet-example
```

Drives the page in Chrome with a fresh key the funder tops up with 0.05 devnet SOL: register, shield, send privately, send with an app fee and unshield, failing unless every transfer and the withdrawal are proved in the page. The key returns what is left to the funder.
