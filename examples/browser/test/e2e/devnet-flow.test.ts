/**
 * One shield -> split -> transfer -> unshield round trip through the published
 * SDK, with every proof produced by `@zolana/web-prover` and checked on-chain.
 *
 * Opt-in: set ZOLANA_E2E_FUNDER to a Solana CLI keypair file funded on the
 * target cluster (devnet by default). The funder only pays two small top-ups to
 * fresh actors, which return their remaining lamports afterwards.
 */
import { readFileSync } from "node:fs";
import { afterAll, expect, it } from "vitest";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createTransactionMessage,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type KeyPairSigner,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  Wallet,
  buildRegistrationTransaction,
  createZolanaClient,
  type Bytes32,
} from "@heliuslabs/zolana";
import { ZolanaWebProver } from "@zolana/web-prover";

import { proverMeasurementSink, runFlow } from "../../src/flow.js";
import { signSendAndConfirm } from "../../src/submit.js";
import { nodeProverWorker } from "./node-worker.js";

const funderPath = process.env["ZOLANA_E2E_FUNDER"];
const endpoints = {
  solanaRpcUrl: process.env["ZOLANA_E2E_RPC_URL"] ?? "https://api.devnet.solana.com",
  indexerUrl: process.env["ZOLANA_E2E_INDEXER_URL"] ?? "https://d2xah7tnhdhcom.cloudfront.net",
  // `/prove/<key>` is answered locally; any other prover route still reaches it.
  proverUrl: process.env["ZOLANA_E2E_PROVER_URL"] ?? "https://d21ni15goiip6l.cloudfront.net",
};
const root = new URL("../../../../", import.meta.url);
const runtimeLock = JSON.parse(readFileSync(new URL("runtime.lock.json", root), "utf8")) as {
  provingKeysBaseUrl: string;
};
const keyLock = JSON.parse(
  readFileSync(new URL("wasm/prover/provingkeys/proving-keys.lock", root), "utf8"),
) as { keys: Record<string, { size: number; sha256: string }> };

type ZolanaClient = Awaited<ReturnType<typeof createZolanaClient>>;
type Actor = Readonly<{ signer: KeyPairSigner; keypair: ShieldedKeypair }>;
const actors: Actor[] = [];
let cleanup: (() => Promise<void>) | undefined;
afterAll(async () => cleanup?.());

it.skipIf(funderPath === undefined)(
  "proves a devnet round trip locally and lands every proof on-chain",
  async () => {
    const keyBaseUrl = runtimeLock.provingKeysBaseUrl.replace(/\/+$/u, "");
    const remoteProve: string[] = [];
    const local: { proofs: number; failures: string[] } = { proofs: 0, failures: [] };
    const prover = new ZolanaWebProver({
      wasmUrl: new URL("dist/bridge/zolana-prover.wasm", root).href,
      threads: 0,
      keyBaseUrl,
      proverUrl: endpoints.proverUrl,
      workerFactory: nodeProverWorker,
      // What setup-assets writes to keys/manifest.json, served beside the CDN keys.
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === `${keyBaseUrl}/manifest.json`) return Response.json(keyLock.keys);
        if (/\/prove(\/|$)/u.test(new URL(url).pathname)) remoteProve.push(url);
        return fetch(input, init);
      },
      onMeasurement: (measurement) => {
        if (measurement.step === "transfer-prove") {
          if (measurement.ms > 0) local.proofs += 1;
          else local.failures.push(measurement.note ?? "unknown");
        }
        proverMeasurementSink(measurement);
      },
    });
    // A local prover cannot answer `/prove/<key>/indexed`, so the client fetches proof data itself.
    const client = await createZolanaClient({
      ...endpoints,
      proofDataSource: "client",
      fetch: prover.createFetch(),
    });
    const funder = await createKeyPairSignerFromBytes(
      Uint8Array.from(JSON.parse(readFileSync(funderPath ?? "", "utf8")) as number[]),
    );
    cleanup = async () => {
      prover.terminate();
      for (const actor of actors) await refund(client, actor.signer, funder.address);
    };

    const sender = await actor(client, funder, 50_000_000n);
    const receiver = await actor(client, funder, 10_000_000n);
    const result = await runFlow(
      {
        client,
        wallet: new Wallet({ identity: sender.keypair.shieldedAddress() }),
        keys: LocalKeys.fromKeypair(sender.keypair, client.proofService),
        shieldedAddress: sender.keypair.shieldedAddress(),
        signer: sender.signer,
        transferRecipient: receiver.signer.address,
        withdrawalRecipient: sender.signer.address,
        shieldAmount: 10_000_000n,
        prover: "wasm",
      },
      { notes: 2 },
    );

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(local.failures).toEqual([]);
    // Split (1 into 2), the 2-input transfer and the withdrawal.
    expect(local.proofs).toBe(3);
    expect(remoteProve).toEqual([]);

    const landed = await client.solanaRpc
      .getSignaturesForAddress(sender.signer.address)
      .send();
    console.info(
      `sender ${sender.signer.address} signatures, oldest first:\n${landed
        .map((entry) => `  ${entry.signature}${entry.err === null ? "" : " (failed)"}`)
        .reverse()
        .join("\n")}`,
    );
  },
  600_000,
);

/** A fresh owner whose Solana signer and shielded keypair share one seed, registered. */
async function actor(client: ZolanaClient, funder: KeyPairSigner, amount: bigint): Promise<Actor> {
  const seed = crypto.getRandomValues(new Uint8Array(32)) as Bytes32;
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed));
  seed.fill(0);
  actors.push({ signer, keypair });
  await transfer(client, funder, signer.address, amount);
  const registration = await buildRegistrationTransaction({
    client,
    owner: signer.address,
    address: keypair.shieldedAddress(),
  });
  if (registration !== undefined) await signSendAndConfirm(client, registration, [signer]);
  return { signer, keypair };
}

async function transfer(
  client: ZolanaClient,
  source: KeyPairSigner,
  destination: KeyPairSigner["address"],
  amount: bigint,
): Promise<void> {
  const { value: blockhash } = await client.solanaRpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(source, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstruction(
        getTransferSolInstruction({ source, destination, amount: lamports(amount) }),
        m,
      ),
  );
  await signSendAndConfirm(client, compileTransaction(message), [source]);
}

/** Returns what an actor has left, less the one signature fee. */
async function refund(client: ZolanaClient, signer: KeyPairSigner, funder: KeyPairSigner["address"]) {
  const { value: balance } = await client.solanaRpc.getBalance(signer.address).send();
  if (balance > 5_000n) await transfer(client, signer, funder, balance - 5_000n).catch(() => {});
}
