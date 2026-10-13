/**
 * One private SOL transfer that pays several recipients, for example a payment
 * and an application fee, built from the public primitives of
 * `@heliuslabs/zolana` 0.4.0-alpha.
 *
 * The SDK's transaction builders check the proved transfer against an approved
 * intent before returning it. This path has no intent, so it checks the
 * prepared outputs itself before proving.
 */
import { LocalKeys, SOL_MINT, Wallet, type ShieldedAddress, type WalletUtxo } from "@heliuslabs/zolana";
import { getTransactInstructionAsync } from "@heliuslabs/zolana/instructions";
import {
  ConfidentialTransfer,
  ProofInputUtxo,
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
import type { Client } from "./zolana.js";

export interface Payment {
  readonly recipient: Address;
  readonly amount: bigint;
}

/**
 * Up to three payments and the change fit a 4-output proof, which takes at
 * most 24 notes.
 */
const MAX_PAYMENTS = 3;
const MAX_NOTES = 24;
/** The SDK client's defaults for a transact. */
const COMPUTE_UNIT_LIMIT = 450_000;
const LOADED_ACCOUNTS_DATA_SIZE_LIMIT = 64 * 1024 * 1024;

export async function buildPaymentsTransaction(
  input: Readonly<{ client: Client; wallet: Wallet; keys: LocalKeys; payments: readonly Payment[] }>,
): Promise<Transaction> {
  const { client, wallet, keys, payments } = input;
  if (payments.length < 2 || payments.length > MAX_PAYMENTS) {
    throw new Error(`Pay two to ${MAX_PAYMENTS} recipients`);
  }
  if (payments.some((payment) => payment.amount <= 0n)) throw new Error("Every payment needs an amount");

  const resolved: { address: ShieldedAddress; amount: bigint }[] = [];
  for (const payment of payments) {
    const registered = await resolveRegisteredAddress({ rpc: client, owner: payment.recipient });
    if (registered === undefined) throw new Error(`${payment.recipient} has no private account`);
    resolved.push({ address: registered.address, amount: payment.amount });
  }

  const owner = keys.address();
  const total = resolved.reduce((sum, payment) => sum + payment.amount, 0n);
  const inputs = selectNotes(wallet, client.tree, total).map(
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

  const minted = await keys.transactionKeys([
    { viewingPublicKey: owner.viewingPublicKey, firstNullifier: prepared.firstNullifier },
  ]);
  let encrypted;
  try {
    const [tx] = minted;
    if (tx === undefined || minted.length !== 1) throw new Error("Expected one transaction key");
    encrypted = encryptConfidentialTransfer(tx, { outputs: prepared.outputs, assets: wallet.registry });
  } finally {
    for (const key of minted) key.destroy();
  }
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

/** Plain SOL notes in the client's tree, largest first, until they cover `amount`. */
function selectNotes(wallet: Wallet, tree: Address, amount: bigint): WalletUtxo[] {
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
  if (selected.length > MAX_NOTES) throw new Error(`Needs more than ${MAX_NOTES} notes; merge first`);
  return selected;
}

/** Each payment is one output, in order, after the sender's change. */
function checkOutputs(
  prepared: PreparedTransfer,
  payments: readonly { address: ShieldedAddress; amount: bigint }[],
): void {
  const paid = prepared.outputs.slice(prepared.senderOutputCount);
  const matches =
    paid.length === payments.length &&
    paid.every((output, index) => {
      const payment = payments[index];
      const owner = output.ownerAddress?.toBytes();
      const expected = payment?.address.toBytes();
      return (
        owner !== undefined &&
        expected !== undefined &&
        owner.length === expected.length &&
        owner.every((byte, i) => byte === expected[i]) &&
        output.asset === SOL_MINT &&
        output.amount === payment?.amount
      );
    });
  if (!matches) throw new Error("The prepared transfer does not match the payments");
}
