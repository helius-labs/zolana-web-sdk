import {
  LocalKeys,
  SOL_MINT,
  Wallet,
  buildDepositTransaction,
  buildRegistrationTransaction,
  buildTransferTransaction,
  buildWithdrawalTransaction,
  createZolanaClient,
  getPrivateTransactions,
  syncWallet,
  type Bytes32,
  type ShieldedAddress,
} from "@heliuslabs/zolana";
import { ed25519DerivationMessage } from "@heliuslabs/zolana/keypair";
import { isWalletRegistered } from "@heliuslabs/zolana/wallet";
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
import { ZolanaWebProver, type Measurement } from "@zolana/web-prover";

export const endpoints = {
  solanaRpcUrl: import.meta.env.VITE_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  indexerUrl: import.meta.env.VITE_INDEXER_URL ?? "https://d2xah7tnhdhcom.cloudfront.net",
  proverUrl: import.meta.env.VITE_PROVER_URL ?? "https://d21ni15goiip6l.cloudfront.net",
};

type Client = Awaited<ReturnType<typeof createZolanaClient>>;
export type PrivateTransaction = ReturnType<typeof getPrivateTransactions>[number];

export interface Session {
  readonly prover: ZolanaWebProver;
  readonly client: Client;
  readonly signer: KeyPairSigner;
  readonly keys: LocalKeys;
  readonly wallet: Wallet;
  readonly shieldedAddress: ShieldedAddress;
}

export interface Snapshot {
  readonly publicLamports: bigint;
  readonly privateLamports: bigint;
  readonly registered: boolean;
  readonly history: readonly PrivateTransaction[];
}

/**
 * Proofs are made by the prover's worker: the client's `fetch` answers its
 * `/prove/<key>` requests locally, and everything else goes to the network.
 */
export async function openSession(seed: Uint8Array, onMeasurement: (m: Measurement) => void): Promise<Session> {
  const prover = new ZolanaWebProver({
    wasmUrl: `${import.meta.env.BASE_URL}prover/zolana-prover.wasm`,
    keyBaseUrl: `${import.meta.env.BASE_URL}keys`,
    proverUrl: endpoints.proverUrl,
    onMeasurement,
  });
  const client = await createZolanaClient({
    ...endpoints,
    // A local prover cannot answer the indexed route, so the client gathers proof data.
    proofDataSource: "client",
    fetch: prover.createFetch(),
  });
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  // The keys derive from the owner's signature over the Solana off-chain
  // message the SDK defines; a wallet would produce it with signMessage.
  const publicKey = new Uint8Array(getAddressEncoder().encode(signer.address)) as Bytes32;
  const derivationSeed = await signBytes(signer.keyPair.privateKey, ed25519DerivationMessage(publicKey));
  const keys = LocalKeys.fromDerivationSeed({ solanaPublicKey: signer.address, derivationSeed }, client.proofService);
  const shieldedAddress = keys.address();
  return { prover, client, signer, keys, wallet: new Wallet({ identity: shieldedAddress }), shieldedAddress };
}

export async function snapshot(session: Session, requireSlot?: bigint): Promise<Snapshot> {
  const { client, wallet, keys, signer } = session;
  const [{ value: publicLamports }, registered] = await Promise.all([
    client.solanaRpc.getBalance(signer.address).send(),
    isWalletRegistered({ rpc: client, owner: signer.address }),
  ]);
  if (registered) {
    await syncWallet({ client, wallet, keys, config: requireSlot === undefined ? {} : { requireSlot } });
  }
  return {
    publicLamports,
    privateLamports: wallet.balance(SOL_MINT).amount,
    registered,
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

/** Each action returns the slot it landed in, for the next snapshot to wait for. */
export const actions = {
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
    const transaction = await buildTransferTransaction({ client, wallet, keys, feePayer: signer.address, recipient, amount });
    return submit(session, transaction);
  },
  async unshield(session: Session, amount: bigint): Promise<bigint> {
    const { client, wallet, keys, signer } = session;
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
