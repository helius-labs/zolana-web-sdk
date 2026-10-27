import {
  LocalKeys,
  MergeEncryptionScheme,
  SOL_MINT,
  Wallet,
  buildDepositTransaction,
  buildMultiTransferTransaction,
  buildMergeTransaction,
  buildRegistrationTransaction,
  buildSetMergeEncryptionTransaction,
  buildTransferTransaction,
  buildWithdrawalTransaction,
  createZolanaClient,
  getPrivateTransactions,
  syncWallet,
  type Bytes32,
  type ShieldedAddress,
  type TransferPayment as Payment,
} from "@heliuslabs/zolana";
import { ed25519DerivationMessage } from "@heliuslabs/zolana/keypair";
import { fetchUserRecord } from "@heliuslabs/zolana/wallet";
import {
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  getSignatureFromTransaction,
  sendTransactionWithoutConfirmingFactory,
  signBytes,
  signTransactionWithSigners,
  type Address,
  type KeyPairSigner,
  type Transaction,
} from "@solana/kit";
import { ZolanaWebProver, type Measurement } from "@heliuslabs/zolana-web-prover";
import { limitLocalProofs, localSpendLimit, MERGE_FIRST } from "./local-proving.js";
export type { Payment };

// devnet-d's indexer directly, until the Helius gateway serves devnet-d. The
// prover URL is loopback, so the SDK sends proof requests in plaintext and
// the page answers them; nothing is sent there.
export const endpoints = {
  solanaRpcUrl: import.meta.env.VITE_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  indexerUrl: import.meta.env.VITE_INDEXER_URL ?? "https://d21d98xh5lgv3b.cloudfront.net",
  proverUrl: "http://127.0.0.1:3001",
};

export const teeProverUrl = import.meta.env.VITE_TEE_PROVER_URL ?? "https://d1unet9hn0mci0.cloudfront.net";

type Client = Awaited<ReturnType<typeof createZolanaClient>>;
export type PrivateTransaction = ReturnType<typeof getPrivateTransactions>[number];

export interface Session {
  readonly prover: ZolanaWebProver;
  readonly client: Client;
  readonly mergeClient: Client;
  readonly signer: KeyPairSigner;
  readonly keys: LocalKeys;
  readonly mergeKeys: LocalKeys;
  readonly wallet: Wallet;
  readonly shieldedAddress: ShieldedAddress;
}

export interface Snapshot {
  readonly publicLamports: bigint;
  readonly privateLamports: bigint;
  readonly privateNotes: number;
  readonly localSpendLimit: bigint;
  readonly registered: boolean;
  readonly mergingEnabled: boolean;
  readonly history: readonly PrivateTransaction[];
}

/**
 * Proofs are made by the prover's worker: the client's `fetch` answers its
 * `/prove/<key>` requests locally, and everything else goes to the network.
 */
export async function openSession(seed: Uint8Array, onMeasurement: (m: Measurement) => void): Promise<Session> {
  const prover = new ZolanaWebProver({
    proverUrl: endpoints.proverUrl,
    onMeasurement,
  });
  const client = await createZolanaClient({
    ...endpoints,
    // A local prover cannot answer the indexed route, so the client gathers proof data.
    proofDataSource: "client",
    fetch: limitLocalProofs(prover.createFetch(), endpoints.proverUrl),
  });
  // Merges use the SDK's attested, encrypted transport, without the local
  // prover's fetch interception. Transfers continue to prove in the browser.
  const mergeClient = await createZolanaClient({ ...endpoints, proverUrl: teeProverUrl });
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  // The keys derive from the owner's signature over the Solana off-chain
  // message the SDK defines; a wallet would produce it with signMessage.
  const publicKey = new Uint8Array(getAddressEncoder().encode(signer.address)) as Bytes32;
  const derivationSeed = await signBytes(signer.keyPair.privateKey, ed25519DerivationMessage(publicKey));
  const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey: signer.address, derivationSeed }, client.proofService);
  const mergeKeys = LocalKeys.fromDerivationSeed({ solanaPublicKey: signer.address, derivationSeed }, mergeClient.proofService);
  derivationSeed.fill(0);
  const shieldedAddress = keys.address();
  return { prover, client, mergeClient, signer, keys, mergeKeys, wallet: new Wallet({ identity: shieldedAddress }), shieldedAddress };
}

export async function snapshot(session: Session, requireSlot?: bigint): Promise<Snapshot> {
  const { client, wallet, keys, signer } = session;
  const [{ value: publicLamports }, record] = await Promise.all([
    client.solanaRpc.getBalance(signer.address).send(),
    fetchUserRecord({ rpc: client, owner: signer.address }),
  ]);
  const registered = record !== undefined;
  if (registered) {
    await syncWallet({ client, wallet, keys, config: requireSlot === undefined ? {} : { requireSlot } });
  }
  const balance = wallet.balance(SOL_MINT);
  return {
    publicLamports,
    privateLamports: balance.amount,
    privateNotes: balance.utxos.length,
    localSpendLimit: localSpendLimit(balance.utxos),
    registered,
    mergingEnabled: record?.mergeEncryption === MergeEncryptionScheme.PoseidonCtrV1,
    history: getPrivateTransactions(wallet),
  };
}

async function submit(session: Session, transaction: Transaction): Promise<bigint> {
  const { client, signer } = session;
  const signed = await signTransactionWithSigners([signer], transaction);
  await sendTransactionWithoutConfirmingFactory({ rpc: client.solanaRpc })(signed, {
    commitment: client.commitment,
  });
  return client.confirmTransaction(getSignatureFromTransaction(signed));
}

function checkLocalAmount(wallet: Wallet, amount: bigint): void {
  const balance = wallet.balance(SOL_MINT);
  if (amount > balance.amount) throw new Error("Insufficient private balance");
  if (amount > localSpendLimit(balance.utxos)) throw new Error(MERGE_FIRST);
}

/** Each action returns the slot it landed in, for the next snapshot to wait for. */
export const actions = {
  async setMerging(session: Session, enabled: boolean): Promise<bigint> {
    const transaction = await buildSetMergeEncryptionTransaction({
      client: session.client,
      owner: session.signer.address,
      scheme: enabled ? MergeEncryptionScheme.PoseidonCtrV1 : MergeEncryptionScheme.Disabled,
    });
    return submit(session, transaction);
  },
  async merge(session: Session): Promise<bigint> {
    const { mergeClient: client, mergeKeys: keys, wallet, signer } = session;
    // Explicit attestation also refuses a plaintext loopback prover here.
    await client.attestProver();
    await syncWallet({ client, wallet, keys });
    const transaction = await buildMergeTransaction({ client, wallet, keys, feePayer: signer.address });
    return submit(session, transaction);
  },
  async register(session: Session): Promise<bigint | undefined> {
    const transaction = await buildRegistrationTransaction({
      client: session.client,
      owner: session.signer.address,
      address: session.shieldedAddress,
    });
    return transaction === undefined ? undefined : submit(session, transaction);
  },
  async shield(session: Session, amount: bigint): Promise<bigint> {
    const transaction = await buildDepositTransaction({
      client: session.client,
      feePayer: session.signer.address,
      recipient: session.shieldedAddress,
      amount,
    });
    return submit(session, transaction);
  },
  async send(session: Session, recipient: Address, amount: bigint): Promise<bigint> {
    const { client, wallet, keys, signer } = session;
    checkLocalAmount(wallet, amount);
    const transaction = await buildTransferTransaction({ client, wallet, keys, feePayer: signer.address, recipient, amount });
    return submit(session, transaction);
  },
  /** One transfer and one proof pay every recipient, each a private output. */
  async pay(session: Session, payments: readonly Payment[]): Promise<bigint> {
    const { client, wallet, keys, signer } = session;
    checkLocalAmount(wallet, payments.reduce((total, payment) => total + payment.amount, 0n));
    const transaction = await buildMultiTransferTransaction({ client, wallet, keys, feePayer: signer.address, payments });
    return submit(session, transaction);
  },
  async unshield(session: Session, amount: bigint): Promise<bigint> {
    const { client, wallet, keys, signer } = session;
    checkLocalAmount(wallet, amount);
    const transaction = await buildWithdrawalTransaction({
      client,
      wallet,
      keys,
      feePayer: signer.address,
      recipient: signer.address,
      amount,
    });
    return submit(session, transaction);
  },
};
