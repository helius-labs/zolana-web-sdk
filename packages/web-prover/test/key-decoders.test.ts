import { afterEach, expect, it, vi } from "vitest";
import { decodeKey } from "../src/key-decoders.js";

afterEach(() => {
  vi.restoreAllMocks();
});

it("splits each vector into runs and joins the workers' decompressed points", async () => {
  // Five vectors: 64 B G1, 64 B G1, 64 B G1, 64 B G1, 128 B G2 (two G2 points).
  const ranges = new Uint32Array([0, 64, 64, 64, 128, 64, 192, 64, 256, 128]);
  const key = new Uint8Array(384);
  for (let i = 0; i < key.length; i++) key[i] = i & 0xff;
  const runtime = { key_vectors: vi.fn(() => ranges) };
  const workers: Array<{
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    addEventListener: (type: string, listener: EventListener) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
  }> = [];

  const vectors = await decodeKey(runtime, key, 2, () => {
    const listeners = new Map<string, Set<EventListener>>();
    const worker = {
      postMessage: vi.fn((request: { id: number; points: ArrayBuffer; g2: boolean }) => {
        const compressed = new Uint8Array(request.points);
        const decoded = new Uint8Array(compressed.byteLength * 2);
        for (let i = 0; i < compressed.length; i++) decoded[i * 2] = compressed[i]!;
        queueMicrotask(() => {
          for (const listener of listeners.get("message") ?? []) {
            listener(
              new MessageEvent("message", {
                data: { id: request.id, ok: true, points: decoded.buffer },
              }),
            );
          }
        });
      }),
      terminate: vi.fn(),
      addEventListener(type: string, listener: EventListener) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener(type: string, listener: EventListener) {
        listeners.get(type)?.delete(listener);
      },
    };
    workers.push(worker);
    return worker as unknown as Worker;
  });

  expect(runtime.key_vectors).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(2);
  expect(vectors).toHaveLength(5);
  expect(vectors[0]!.byteLength).toBe(128);
  expect(vectors[4]!.byteLength).toBe(256);
  expect(vectors[0]![0]).toBe(key[0]);
  expect(vectors[4]![0]).toBe(key[256]);
  for (const worker of workers) expect(worker.terminate).toHaveBeenCalledOnce();
});
