/**
 * Decompression of a key file's points across workers, for the runtime
 * without a thread pool. Decompressing is nearly all of a key's first load (a
 * square root per point: about 20 s of an 8x2 key on one thread), and each
 * point is independent, so plain workers, which need no shared memory, take
 * runs of whole points and the prover loads the key from the joined vectors.
 */

import type { Runtime } from "./runtime.js";

/** Points a worker decompresses at a time: 1 MiB of G1, 2 MiB of G2. */
const runPoints = 32_768;

export type DecodeRequest = Readonly<{ id: number; points: ArrayBuffer; g2: boolean }>;
export type DecodeResponse = Readonly<{ id: number; ok: boolean; points?: ArrayBuffer }>;

/**
 * The five vectors of `key` (a key file) decompressed by `count` workers from
 * `spawn`, in order, as `ZolanaProver.from_vectors` takes them. Every worker
 * ends when this settles.
 */
export async function decodeKey(
  runtime: Pick<Runtime, "key_vectors">,
  key: Uint8Array,
  count: number,
  spawn: () => Worker = createKeyDecoder,
): Promise<Uint8Array[]> {
  const ranges = runtime.key_vectors(key);
  const vectors: Uint8Array[] = [];
  const runs: { vector: number; offset: number; at: number; length: number; g2: boolean }[] = [];
  for (let vector = 0; vector < 5; vector++) {
    const [at, length] = [ranges[2 * vector]!, ranges[2 * vector + 1]!];
    const g2 = vector === 4;
    // A decompressed point is twice its compressed size, G1 and G2 alike.
    vectors.push(new Uint8Array(length * 2));
    const step = runPoints * (g2 ? 64 : 32);
    for (let offset = 0; offset < length; offset += step) {
      runs.push({ vector, offset, at: at + offset, length: Math.min(step, length - offset), g2 });
    }
  }
  // The G2 runs cost the most: first, so that no worker ends on one alone.
  runs.reverse();
  const workers: Worker[] = [];
  try {
    for (let i = 0; i < Math.min(count, runs.length); i++) workers.push(spawn());
    let next = 0;
    await Promise.all(
      workers.map(async (worker, index) => {
        for (let run = runs[next++]; run !== undefined; run = runs[next++]) {
          const compressed = key.slice(run.at, run.at + run.length);
          const points = await decode(worker, index, compressed, run.g2);
          if (points.byteLength !== run.length * 2) throw new Error("a decoder returned a partial run");
          vectors[run.vector]!.set(points, run.offset * 2);
        }
      }),
    );
  } finally {
    for (const worker of workers) worker.terminate();
  }
  return vectors;
}

/** One run's points from `worker`, which takes one request at a time. */
function decode(worker: Worker, id: number, compressed: Uint8Array, g2: boolean): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const done = () => {
      worker.removeEventListener("message", message);
      worker.removeEventListener("error", failed);
      worker.removeEventListener("messageerror", failed);
    };
    const message = (event: MessageEvent<DecodeResponse>) => {
      done();
      const { ok, points } = event.data;
      if (ok && points instanceof ArrayBuffer) resolve(new Uint8Array(points));
      else reject(new Error("a decoder failed"));
    };
    const failed = (event: Event) => {
      event.preventDefault();
      done();
      reject(new Error("a decoder failed"));
    };
    worker.addEventListener("message", message);
    worker.addEventListener("error", failed);
    worker.addEventListener("messageerror", failed);
    // Own buffer: a view into a larger ArrayBuffer would transfer the whole key.
    const points = compressed.slice().buffer;
    const request: DecodeRequest = { id, points, g2 };
    worker.postMessage(request, [points]);
  });
}

function createKeyDecoder(): Worker {
  // The compiled decoder, which the app's bundler emits beside this worker.
  return new Worker(new URL("./key-decoder.worker.js", import.meta.url), {
    type: "module",
    name: "zolana-key-decoder",
  });
}
