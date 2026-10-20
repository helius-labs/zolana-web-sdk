import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkerRequest } from "../src/wasm-prover.js";

vi.mock("../src/vendor/wasm_exec.js", () => ({}));
// A kernel whose Rayon threads never report ready, as when the page refuses their script.
const kernel = vi.hoisted(() => ({
  default: vi.fn(async () => {}),
  initThreadPool: vi.fn(() => new Promise<void>(() => {})),
  Key: class {},
  decompress_g1: () => {},
  decompress_g2: () => {},
}));
vi.mock("../src/runtime/accelerator/gnark_kernel.js", () => kernel);

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

it("fails initialization when the kernel's thread pool never starts", async () => {
  const init: WorkerRequest = { id: 1, kind: "init", threads: 2 };
  scope.dispatchEvent(new MessageEvent("message", { data: init }));
  await vi.advanceTimersByTimeAsync(29_999);
  expect(kernel.initThreadPool).toHaveBeenCalledWith(2);
  expect(scope.postMessage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
    id: 1,
    ok: false,
    error: "wasm_init_failed",
    ms: expect.any(Number),
  });
});
