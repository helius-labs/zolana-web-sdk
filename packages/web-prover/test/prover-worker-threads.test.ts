import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkerRequest } from "../src/wasm-prover.js";

// A runtime whose Rayon threads never report ready, as when the page refuses their script.
const runtime = vi.hoisted(() => ({
  default: vi.fn(async () => {}),
  initThreadPool: vi.fn(() => new Promise<void>(() => {})),
  init_gpu: vi.fn(async () => {}),
  raw_format: () => "raw-test",
  ZolanaProver: class {},
}));
vi.mock("../src/runtime.js", () => ({ importRuntime: async () => runtime }));

let scope: EventTarget & { postMessage: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  vi.useFakeTimers();
  scope = Object.assign(new EventTarget(), { postMessage: vi.fn() });
  vi.stubGlobal("self", scope);
  vi.stubGlobal("crossOriginIsolated", true);
  await import("../src/prover.worker.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("fails initialization when the runtime's thread pool never starts", async () => {
  const init: WorkerRequest = { id: 1, kind: "init", threads: 2 };
  scope.dispatchEvent(new MessageEvent("message", { data: init }));
  await vi.advanceTimersByTimeAsync(29_999);
  expect(runtime.initThreadPool).toHaveBeenCalledWith(2);
  expect(scope.postMessage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
    id: 1,
    ok: false,
    error: "wasm_init_failed",
    ms: expect.any(Number),
  });
});
