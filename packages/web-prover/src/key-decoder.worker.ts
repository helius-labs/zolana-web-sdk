/// <reference lib="webworker" />
/**
 * Decompresses runs of a key file's points for the prover worker when the
 * page has no thread pool (`key-decoders.ts`), on the runtime without shared
 * memory.
 */

import type { DecodeRequest, DecodeResponse } from "./key-decoders.js";
import { importSingleRuntime } from "./runtime.js";

const runtime = importSingleRuntime().then(async (module) => {
  await module.default();
  return module;
});

self.addEventListener("message", (event: MessageEvent<DecodeRequest>) => {
  const { id, points, g2 } = event.data;
  runtime
    .then((module) => module.kernel_points(new Uint8Array(points), g2))
    .then(
      (decoded) => {
        // wasm-bindgen copies the result out of the module's memory into a buffer of its own.
        const buffer = decoded.byteLength === decoded.buffer.byteLength ? decoded.buffer : decoded.slice().buffer;
        const response: DecodeResponse = { id, ok: true, points: buffer as ArrayBuffer };
        self.postMessage(response, [buffer as ArrayBuffer]);
      },
      () => {
        const response: DecodeResponse = { id, ok: false };
        self.postMessage(response);
      },
    );
});
