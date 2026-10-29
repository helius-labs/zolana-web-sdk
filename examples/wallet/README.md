# Private wallet with local proving and TEE merges

A private wallet on devnet-e using v0.6.0-alpha. Transfers and withdrawals are proved in the browser with at most eight input notes. If a payment, including its app fee, needs more notes, merge them through the TEE first.

The whole integration is in [`src/zolana.ts`](src/zolana.ts):

```ts
const prover = new ZolanaWebProver({ proverUrl }); // the bundler emits the runtime; keys come from the key CDN
const client = await createZolanaClient({
  solanaRpcUrl, indexerUrl, proverUrl,
  proofDataSource: "client",
  fetch: limitLocalProofs(prover.createFetch(), proverUrl), // refuse more than eight inputs before local proving
});
const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey, derivationSeed }, client.proofService);
```

The signer is a devnet-only key kept in `localStorage`, standing in for a wallet extension. Swapping in a wallet means replacing `signer`: it signs each transaction and, once, the SDK's derivation message (`ed25519DerivationMessage`) that `derivationSeed` is the signature of.

## Pay a recipient and an app fee in one transfer

With an app fee filled in, Send pays the recipient and the fee collector as two private outputs of one transfer, proved once, through `buildMultiTransferTransaction`.

## Merge before a larger payment

The page shows what the eight largest notes can cover. **Allow merges** enables merging on chain, then **Merge with TEE** combines up to 24 notes on one tree. The SDK attests the prover and encrypts the request to its enclave. The private balance is preserved; public SOL pays network fees. After the merge, balances, note count and history refresh, and local payments can use the consolidated note. Repeat if more notes need combining. **Disable merging** opts out on chain.

Merges use a separate SDK client and `LocalKeys` bound to its remote proof service. They never pass through the browser prover's fetch interceptor. The proof-request guard in `src/local-proving.ts` enforces the local eight-input limit even if note selection changes.

## Run

From the repository root:

```sh
npm ci
npm run build:prover
VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=<key>" npm run dev --workspace @zolana/wallet-example
```

Open http://127.0.0.1:5179, fund the shown address with devnet SOL, then register and shield. Vite emits the prover's worker and runtime from the package; proving keys load on first use from the Zolana key CDN, checked against the digests bundled in the prover, and the page prefetches the 1x2 and 2x2 keys once it connects. The page must be served with the cross-origin isolation headers in `vite.config.ts`, without which the prover does not start.

Without `VITE_SOLANA_RPC_URL` the page uses the public devnet RPC, which rate-limits confirmations. `VITE_INDEXER_URL` defaults to devnet-e's indexer. `VITE_TEE_PROVER_URL` defaults to its attested prover at `https://dd73hh473h6ha.cloudfront.net`. The local prover uses a separate loopback URL intercepted in the page; no local witness is sent there.

Set `VITE_ZOLANA_NETWORK=mainnet` to test the mainnet deployment, with a mainnet
`VITE_SOLANA_RPC_URL`. The network setting selects Photon, Nitro and its trusted
attestation policy together. Demo keys are stored separately for each network
and protocol release. This example keeps its signer in browser storage; use a
dedicated testing account, and use a wallet signer in a production application.
Endpoint overrides retain the selected network's policy, including through a
proxy; a different enclave requires a reviewed policy in the application.

v0.6.0-alpha uses shielded-pool program
`ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW`. Notes and pending transactions
from earlier program IDs cannot be used in this deployment. The old browser
storage entry is preserved for recovery with the older SDK.

## Test

```sh
ZOLANA_E2E_FUNDER=~/.config/solana/id.json \
VITE_SOLANA_RPC_URL="https://beta-devnet.helius-rpc.com/?api-key=<key>" \
npm run test:devnet --workspace @zolana/wallet-example
```

Drives the page in Chrome with a fresh key funded with 0.05 devnet SOL: register, create nine notes, refuse a local spend that needs all nine, opt into merging, merge with an attested encrypted TEE request, verify the unchanged balance and reduced note count, and opt out. Transfers, an app-fee payment and a withdrawal must still prove locally. The key returns its remaining public SOL to the funder. Set `ZOLANA_E2E_ACTION_DELAY_MS=4000` to pace actions when testing with a public RPC.

## Deployment configuration

`src/deployments.ts` is example configuration, independent of the prover package.
Its reviewed policy files in `policies/` include Nitro measurements and the HPKE
key pin. `VITE_TEE_POLICY` accepts replacement policy JSON (bare or a deployment
wrapper); `VITE_TEE_PROVER_URL` changes the URL without selecting a different
policy. Review and pin the policy before distributing it. The local transfer
client uses loopback interception and needs no policy; the separate merge client
always receives the configured remote policy explicitly.
