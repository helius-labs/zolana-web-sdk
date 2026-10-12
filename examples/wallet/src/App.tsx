import { useCallback, useEffect, useRef, useState } from "react";
import { formatAmount, parseAmount } from "@heliuslabs/zolana";
import { address, isAddress } from "@solana/kit";
import type { Measurement } from "@zolana/web-prover";

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
  const [shieldAmount, setShieldAmount] = useState("0.01");
  const [sendTo, setSendTo] = useState("");
  const [sendAmount, setSendAmount] = useState("0.004");
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
      entry.status = "done";
      setState(await snapshot(session, slot));
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
          Devnet. Every proof is made in this browser by <code>@zolana/web-prover</code>; the
          witness never leaves the page.
        </p>
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
                const recipient = sendTo === "" ? owner : sendTo;
                if (!isAddress(recipient)) {
                  setError("The recipient is not a Solana address");
                  return;
                }
                void run(`Send ${sendAmount} SOL privately`, (s) => actions.send(s, address(recipient), amount(sendAmount)));
              }}
            >
              <input
                data-testid="send-to"
                placeholder="Registered recipient (empty: yourself)"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
              />
              <input data-testid="send-amount" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} />
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
