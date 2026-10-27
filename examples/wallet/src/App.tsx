import { useCallback, useEffect, useRef, useState } from "react";
import { formatAmount, parseAmount } from "@heliuslabs/zolana";
import { address, isAddress } from "@solana/kit";
import { shapeByLabel, type KeyProgress, type Measurement } from "@heliuslabs/zolana-web-prover";

import { loadBurnerSeed, resetBurner } from "./burner.js";
import { actions, openSession, snapshot, type PrivateTransaction, type Session, type Snapshot } from "./zolana.js";

interface Activity {
  readonly id: number;
  readonly label: string;
  status: "running" | "done" | "failed";
  detail?: string;
  proofs: { ms: number; note?: string }[];
}

const sol = (lamports: bigint) => `${formatAmount(lamports, 9)} SOL`;

const historyLabel: Record<PrivateTransaction["kind"], string> = {
  deposit: "Shielded",
  privateTransfer: "Private transfer",
  publicWithdrawal: "Unshielded",
  split: "Split",
  merge: "Merge",
  ringEntry: "Ring entry",
};

export function App(): React.ReactElement {
  const [session, setSession] = useState<Session>();
  const [state, setState] = useState<Snapshot>();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keys, setKeys] = useState("Preparing proving keys…");
  const [shieldAmount, setShieldAmount] = useState("0.01");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("0.004");
  const [fee, setFee] = useState("");
  const [feeCollector, setFeeCollector] = useState("");
  const [unshieldAmount, setUnshieldAmount] = useState("0.002");
  const current = useRef<Activity | undefined>(undefined);
  const nextId = useRef(1);

  const onMeasurement = useCallback((measurement: Measurement) => {
    const entry = current.current;
    if (entry === undefined || measurement.step !== "transfer-prove" || measurement.ms === 0) return;
    entry.proofs.push({ ms: measurement.ms, ...(measurement.note === undefined ? {} : { note: measurement.note }) });
    setActivity((list) => [...list]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void openSession(loadBurnerSeed(), onMeasurement)
      .then(async (opened) => {
        if (cancelled) return;
        setSession(opened);
        // Download and decode the common shapes now, so the first send or unshield
        // doesn't wait seconds for its key. Later visits read them from the cache.
        void opened.prover
          .prefetch({ shapes: [shapeByLabel("1x2"), shapeByLabel("2x2")], onProgress: (update) => setKeys(keyStatus(update)) })
          .then(
            () => setKeys("Proving keys ready"),
            () => setKeys("Proving keys load on first use"),
          );
        setState(await snapshot(opened));
      })
      .catch((cause: unknown) => setError(String(cause)));
    return () => {
      cancelled = true;
    };
  }, [onMeasurement]);

  const run = async (label: string, action: (s: Session) => Promise<bigint | undefined>) => {
    if (session === undefined || busy) return;
    const entry: Activity = { id: nextId.current++, label, status: "running", proofs: [] };
    current.current = entry;
    setActivity((list) => [entry, ...list]);
    setBusy(true);
    setError("");
    try {
      const slot = await action(session);
      setState(await snapshot(session, slot));
      entry.status = "done";
    } catch (cause) {
      entry.status = "failed";
      entry.detail = cause instanceof Error ? cause.message : String(cause);
    } finally {
      current.current = undefined;
      setActivity((list) => [...list]);
      setBusy(false);
    }
  };

  const amount = (value: string) => parseAmount(value, 9);

  if (session === undefined || state === undefined) {
    return (
      <main>
        <h1>Private wallet</h1>
        <p className="muted">{error === "" ? "Starting the prover…" : error}</p>
      </main>
    );
  }

  const owner = session.signer.address;
  return (
    <main>
      <header>
        <h1>Private wallet</h1>
        <p className="muted">
          Devnet. Transfers are proved in this browser. Merges are proved in an attested TEE over an encrypted connection.
        </p>
        <p className="muted" data-testid="keys">{keys}</p>
      </header>

      <section>
        <h2>Account</h2>
        <p className="mono" data-testid="owner">{owner}</p>
        <p>
          Public balance <strong data-testid="public-balance">{sol(state.publicLamports)}</strong>
        </p>
        {state.publicLamports === 0n && (
          <p className="muted">
            Fund this devnet address, for example from <a href="https://faucet.solana.com">faucet.solana.com</a>.
          </p>
        )}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            resetBurner();
            location.reload();
          }}
        >
          New key
        </button>
      </section>

      <section>
        <h2>Private balance</h2>
        <p className="balance" data-testid="private-balance">{sol(state.privateLamports)}</p>
        <p className="muted">
          Local proofs use at most 8 input notes: up to <span data-testid="local-spend-limit">{sol(state.localSpendLimit)}</span> per payment,
          including any app fee. Merge with the TEE first if you need more.
        </p>
        {!state.registered ? (
          <button data-testid="register" disabled={busy} onClick={() => run("Register", actions.register)}>
            Register private wallet
          </button>
        ) : (
          <div className="forms">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(`Shield ${shieldAmount} SOL`, (s) => actions.shield(s, amount(shieldAmount)));
              }}
            >
              <input data-testid="shield-amount" value={shieldAmount} onChange={(e) => setShieldAmount(e.target.value)} />
              <button data-testid="shield" disabled={busy}>Shield</button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const recipient = sendTo.trim() === "" ? owner : sendTo.trim();
                const collector = feeCollector.trim() === "" ? owner : feeCollector.trim();
                if (!isAddress(recipient)) {
                  setError("The recipient is not a Solana address");
                  return;
                }
                if (!isAddress(collector)) {
                  setError("The fee collector is not a Solana address");
                  return;
                }
                if (fee.trim() === "") {
                  void run(`Send ${sendAmount} SOL privately`, (s) => actions.send(s, address(recipient), amount(sendAmount)));
                  return;
                }
                // Recipient and fee collector are paid by one transfer and one proof.
                void run(`Send ${sendAmount} SOL privately with a ${fee} SOL fee`, (s) =>
                  actions.pay(s, [
                    { recipient: address(recipient), amount: amount(sendAmount) },
                    { recipient: address(collector), amount: amount(fee) },
                  ]),
                );
              }}
            >
              <input
                data-testid="send-to"
                placeholder="Registered recipient (empty: yourself)"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
              />
              <input data-testid="send-amount" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
              <input
                data-testid="send-fee"
                placeholder="App fee (optional)"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
              <input
                data-testid="fee-collector"
                placeholder="Fee collector (empty: yourself)"
                value={feeCollector}
                onChange={(e) => setFeeCollector(e.target.value)}
              />
              <button data-testid="send" disabled={busy}>Send</button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void run(`Unshield ${unshieldAmount} SOL`, (s) => actions.unshield(s, amount(unshieldAmount)));
              }}
            >
              <input data-testid="unshield-amount" value={unshieldAmount} onChange={(e) => setUnshieldAmount(e.target.value)} />
              <button data-testid="unshield" disabled={busy}>Unshield</button>
            </form>
          </div>
        )}
        {error !== "" && <p role="alert">{error}</p>}
      </section>

      {state.registered && (
        <section>
          <h2>Merge private notes</h2>
          <p className="muted">
            Combine up to 24 SOL notes on one tree. Your private balance stays the same; you pay network fees from public SOL.
            Allowing merges lets a prover combine your notes while keeping the funds in your wallet.
          </p>
          <p><span data-testid="private-notes">{state.privateNotes}</span> private notes</p>
          <p data-testid="merging-status">Merging is {state.mergingEnabled ? "on" : "off"}.</p>
          <button
            className="secondary"
            data-testid="toggle-merging"
            disabled={busy}
            onClick={() => run(state.mergingEnabled ? "Disable merging" : "Enable merging", (s) => actions.setMerging(s, !state.mergingEnabled))}
          >
            {state.mergingEnabled ? "Disable merging" : "Allow merges"}
          </button>{" "}
          <button
            data-testid="merge"
            disabled={busy || !state.mergingEnabled || state.privateNotes < 2}
            onClick={() => run("Merge with TEE", actions.merge)}
          >
            Merge with TEE
          </button>
          {state.privateNotes < 2 && <p className="muted">At least two notes are needed to merge.</p>}
        </section>
      )}

      <section>
        <h2>Activity</h2>
        {activity.length === 0 && <p className="muted">Nothing yet.</p>}
        <ul data-testid="activity">
          {activity.map((entry) => (
            <li key={entry.id} data-status={entry.status}>
              <span>{entry.label}</span> <span className={entry.status}>{entry.status}</span>
              {entry.proofs.map((proof, index) => (
                <span key={index} className="proof" data-testid="local-proof">
                  proved locally in {Math.round(proof.ms)} ms
                </span>
              ))}
              {entry.detail !== undefined && <p className="muted">{entry.detail}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>History</h2>
        {state.history.length === 0 && <p className="muted">No private transactions yet.</p>}
        <ul data-testid="history">
          {state.history.map((transaction, index) => (
            <li key={index}>
              {historyLabel[transaction.kind]} · {transaction.direction} · {sol(transaction.amount)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function keyStatus({ keyFile, stage, loaded, total }: KeyProgress): string {
  if (stage === "decode") return `Decoding ${keyFile}…`;
  return `Downloading ${keyFile}: ${String(Math.floor((100 * loaded) / total))}%`;
}
