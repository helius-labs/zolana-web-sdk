// Hosts @zolana/web-prover's built browser worker in a Node worker thread: the
// worker only needs `self` messaging and a fetch that can read the local wasm.
import { readFile } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";

const networkFetch = globalThis.fetch;
Object.assign(globalThis, {
  self: globalThis,
  async fetch(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== "file:") return networkFetch(input, init);
    return new Response(await readFile(url), { headers: { "content-type": "application/wasm" } });
  },
  addEventListener(type, listener) {
    if (type === "message") parentPort.on("message", (data) => listener({ data }));
  },
  postMessage(message) {
    parentPort.postMessage(message);
  },
});
await import(workerData.bundle);
