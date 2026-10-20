import { existsSync } from "node:fs";
import { Worker as ThreadWorker, type TransferListItem } from "node:worker_threads";

const worker = new URL("../../../../packages/web-prover/dist/prover.worker.js", import.meta.url);

/** `WasmProverOptions.workerFactory` for Node, running the packaged worker. */
export function nodeProverWorker(): Worker {
  if (!existsSync(worker)) throw new Error("Build @heliuslabs/zolana-web-prover first: npm run build:prover");
  const thread = new ThreadWorker(new URL("./prover-worker.mjs", import.meta.url), {
    workerData: { bundle: worker.href },
  });
  const target = new EventTarget();
  thread.on("message", (data) => target.dispatchEvent(new MessageEvent("message", { data })));
  thread.on("error", () => target.dispatchEvent(new Event("error", { cancelable: true })));
  thread.on("messageerror", () => target.dispatchEvent(new Event("messageerror")));
  return Object.assign(target, {
    postMessage(message: unknown, transfer?: readonly TransferListItem[]) {
      thread.postMessage(message, transfer);
    },
    terminate() {
      void thread.terminate();
    },
  }) as unknown as Worker;
}
