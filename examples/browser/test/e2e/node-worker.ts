import { readdirSync } from "node:fs";
import { Worker as ThreadWorker, type TransferListItem } from "node:worker_threads";

const assets = new URL("../../../../packages/web-prover/dist/assets/", import.meta.url);

/** `WasmProverOptions.workerFactory` for Node, running the packaged worker bundle. */
export function nodeProverWorker(): Worker {
  const bundle = readdirSync(assets).find((name) => /^prover\.worker-.*\.js$/u.test(name));
  if (bundle === undefined) throw new Error("Build @zolana/web-prover first: npm run build:prover");
  const thread = new ThreadWorker(new URL("./prover-worker.mjs", import.meta.url), {
    workerData: { bundle: new URL(bundle, assets).href },
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
