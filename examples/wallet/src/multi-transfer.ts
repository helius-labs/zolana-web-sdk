/**
 * One private SOL transfer that pays several recipients, for example a payment
 * and an application fee, built from the public primitives of
 * `@heliuslabs/zolana` 0.4.0-alpha.
 *
 * The SDK's transaction builders check the proved transfer against an approved
 * intent before returning it. This path has no intent, so it checks the
 * prepared outputs itself before proving.
 */
import {
  SOL_MINT,
  createZolanaClient,
  type Bytes32,
  type LocalKeys,
  type ShieldedAddress,
  type Wallet,
  type WalletUtxo,
} from "@heliuslabs/zolana";
import { getTransactInstructionAsync } from "@heliuslabs/zolana/instructions";
import type { ViewingKey } from "@heliuslabs/zolana/keypair";
import {
  ConfidentialTransfer,
  ProofInputUtxo,
  canonicalShape,
  encryptConfidentialTransfer,
  type PreparedTransfer,
} from "@heliuslabs/zolana/transaction";
import { resolveRegisteredAddress } from "@heliuslabs/zolana/wallet";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  pipe,
  setTransactionMessageConfig,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Transaction,
} from "@solana/kit";

export interface Payment {
  readonly recipient: Address;
  readonly amount: bigint;
}

/** What this builder needs of the client: the tree, the registry, proving and a blockhash. */
type ProvingClient = Pick<
  Awaited<ReturnType<typeof createZolanaClient>>,
  "tree" | "treeId" | "getAccount" | "proveTransact" | "getLatestBlockhash"
>;

interface ResolvedPayment {
  readonly address: ShieldedAddress;
  readonly amount: bigint;
}

/** The SDK client's defaults for a transact. */
const COMPUTE_UNIT_LIMIT = 450_000;
const LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 64 * 1024 * 1024;

export async function buildPaymentsTransaction(
  input: Readonly<{
    client: ProvingClient;
    wallet: Wallet;
    keys: LocalKeys;
    payments: readonly Payment[];
  }>,
): Promise<Transaction> {
  const { client, wallet, keys, payments } = input;
  if (payments.length < 2) throw new Error("A single payment is a plain transfer");
  if (payments.some((payment) => payment.amount <= 0n)) throw new Error("Every payment needs an amount");

  const resolved: ResolvedPayment[] = [];
  for (const payment of payments) {
    const registered = await resolveRegisteredAddress({ rpc: client, owner: payment.recipient });
    if (registered === undefined) throw new Error(`${payment.recipient} has no private account`);
    resolved.push({ address: registered.address, amount: payment.amount });
  }

  const owner = keys.address();
  const total = resolved.reduce((sum, payment) => sum + payment.amount, 0n);
  // The payments and a change output: the shape table says how many UTXOs that proof takes.
  const inputs = selectUtxos(wallet, client.tree, total, resolved.length + 1).map(
    (entry) =>
      new ProofInputUtxo({
        utxo: entry.utxo,
        nullifierPublicKey: owner.nullifierPublicKey,
        nullifier: entry.nullifier,
        treeId: client.treeId,
      }),
  );

  // The owner pays the network fee, so its signature also authorizes the spend.
  const transfer = new ConfidentialTransfer(owner, inputs, owner.solanaAddress());
  for (const payment of resolved) transfer.send(payment.address, SOL_MINT, payment.amount);
  const prepared = transfer.prepare();
  checkOutputs(prepared, resolved);

  const encrypted = await withTransactionKey(keys, owner, prepared.firstNullifier, (tx) =>
    encryptConfidentialTransfer(tx, { outputs: prepared.outputs, assets: wallet.registry }),
  );
  const proofInputs = prepared.finalize({
    txViewingPublicKey: encrypted.txViewingPublicKey,
    salt: encrypted.salt,
    payload: encrypted.payload,
  });

  // Fetches the Merkle proofs and proves through the client's fetch, which the
  // web prover answers in this page.
  const data = await client.proveTransact(proofInputs, keys);
  const instruction = await getTransactInstructionAsync({
    payer: owner.solanaAddress(),
    inputTree: client.tree,
    outputTree: client.tree,
    data,
  });
  const lifetime = await client.getLatestBlockhash();
  return compileTransaction(
    pipe(
      createTransactionMessage({ version: 1 }),
      (message) => setTransactionMessageFeePayer(owner.solanaAddress(), message),
      (message) => setTransactionMessageLifetimeUsingBlockhash(lifetime, message),
      (message) =>
        setTransactionMessageConfig(
          { computeUnitLimit: COMPUTE_UNIT_LIMIT, loadedAccountsDataSizeLimit: LOADED_ACCOUNTS_DATA_SIZE_LIMIT },
          message,
        ),
      (message) => appendTransactionMessageInstructions([instruction], message),
    ),
  );
}

/**
 * Plain SOL UTXOs in the client's tree, largest first, until they cover
 * `amount`. The transact instruction names one input tree, so only that tree's
 * UTXOs qualify. Refuses a cover no supported proof shape holds with `outputs`.
 */
function selectUtxos(wallet: Wallet, tree: Address, amount: bigint, outputs: number): WalletUtxo[] {
  const candidates = wallet
    .utxos()
    .filter(
      (entry) =>
        !entry.spent &&
        entry.utxo.asset === SOL_MINT &&
        entry.outputContext.tree === tree &&
        entry.utxo.ringProgramId === undefined &&
        entry.dataHash === undefined &&
        entry.ringDataHash === undefined &&
        entry.utxo.data.isEmpty(),
    )
    .sort((a, b) => (a.utxo.amount === b.utxo.amount ? 0 : a.utxo.amount > b.utxo.amount ? -1 : 1));
  const selected: WalletUtxo[] = [];
  let covered = 0n;
  for (const entry of candidates) {
    if (covered >= amount) break;
    selected.push(entry);
    covered += entry.utxo.amount;
  }
  if (covered < amount) throw new Error("Not enough private SOL");
  try {
    canonicalShape(selected.length, outputs);
  } catch {
    throw new Error(`No proof takes ${String(selected.length)} UTXOs with ${String(outputs)} outputs; merge first`);
  }
  return selected;
}

/** Each payment is one output, in order, after the sender's change. */
function checkOutputs(prepared: PreparedTransfer, payments: readonly ResolvedPayment[]): void {
  const paid = prepared.outputs.slice(prepared.senderOutputCount);
  const matches =
    paid.length === payments.length &&
    payments.every((payment, index) => {
      const output = paid[index];
      return (
        output?.ownerAddress !== undefined &&
        sameBytes(output.ownerAddress.toBytes(), payment.address.toBytes()) &&
        output.asset === SOL_MINT &&
        output.amount === payment.amount
      );
    });
  if (!matches) throw new Error("The prepared transfer does not match the payments");
}

/** The per-transaction key lives for the one sealing step and is destroyed with it. */
async function withTransactionKey<T>(
  keys: LocalKeys,
  owner: ShieldedAddress,
  firstNullifier: Bytes32,
  use: (tx: ViewingKey) => T,
): Promise<T> {
  const minted = await keys.transactionKeys([{ viewingPublicKey: owner.viewingPublicKey, firstNullifier }]);
  try {
    const [tx] = minted;
    if (tx === undefined || minted.length !== 1) throw new Error("Expected one transaction key");
    return use(tx);
  } finally {
    for (const key of minted) key.destroy();
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
