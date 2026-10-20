# Private wallet with local proving

A devnet private wallet where every zero-knowledge proof is made in the browser by `@heliuslabs/zolana-web-prover`: register, shield SOL, send it privately, unshield it, and read the private history through `@heliuslabs/zolana`.

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

With an app fee filled in, Send pays the recipient and the fee collector as two private outputs of one transfer, proved once. `@heliuslabs/zolana` 0.4.0-alpha has no builder for several recipients, so [`src/multi-transfer.ts`](src/multi-transfer.ts) assembles it from public primitives:

```ts
const transfer = new ConfidentialTransfer(owner, inputs, owner.solanaAddress());
transfer.send(recipient, SOL_MINT, amount);
transfer.send(feeCollector, SOL_MINT, fee);
const prepared = transfer.prepare();
// seal the outputs with a per-transaction key, then prove in the page
const encrypted = encryptConfidentialTransfer(tx, { outputs: prepared.outputs, assets: wallet.registry });
const proofInputs = prepared.finalize({ txViewingPublicKey: encrypted.txViewingPublicKey, salt: encrypted.salt, payload: encrypted.payload });
const data = await client.proveTransact(proofInputs, keys);
const instruction = await getTransactInstructionAsync({ payer, inputTree, outputTree, data });
```

The SDK's builders check the proved transfer against the intent the user approved; this path has none, so it checks the prepared outputs against the payments itself. Two payments and the change take a 4-output proof, which spends at most 24 UTXOs; for more payments the shape table decides.

## Run

From the repository root:

```sh
npm ci
npm run build:prover
VITE_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" npm run dev --workspace @zolana/wallet-example
```

Open http://127.0.0.1:5179, fund the shown address with devnet SOL, then register and shield. Vite emits the prover's worker, Go bridge and accelerator from the package; proving keys load on first use from the Zolana key CDN, checked against the digests bundled in the prover, and the page prefetches the 1x2 and 2x2 keys once it connects. The page must be served with the cross-origin isolation headers in `vite.config.ts` for threaded proving.

Without `VITE_SOLANA_RPC_URL` the page uses the public devnet RPC, which rate-limits confirmations. `VITE_INDEXER_URL` and `VITE_PROVER_URL` default to the devnet services; only the prover's non-proving routes are ever called.

## Test

```sh
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
VITE_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=<key>" \
npm run test:devnet --workspace @zolana/wallet-example
```

Drives the page in Chrome with a fresh key the funder tops up with 0.05 devnet SOL: register, shield, send privately, send with an app fee and unshield, failing unless every transfer and the withdrawal are proved in the page. The key returns what is left to the funder.
