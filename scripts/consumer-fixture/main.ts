import { ZolanaWebProver, WasmProverError, type Measurement } from "@zolana/web-prover";

declare global {
  interface Window {
    checkPackedProver: () => Promise<unknown>;
  }
}

window.checkPackedProver = async () => {
  const request = await (await fetch("/fixtures/transfer-2x3.json")).json();
  const sentinel = "review-private-sentinel";
  const measurements: Measurement[] = [];
  const results: unknown[] = [];
  const rawWorker = new Worker(new URL("./raw-bridge.worker.ts", import.meta.url), {
    type: "module",
  });
  try {
    const invalid = structuredClone(request);
    invalid.inputs[0].nullifierSecret = sentinel;
    const raw = await new Promise<{ failures?: unknown[] }>((resolve, reject) => {
      rawWorker.onmessage = (event) => resolve(event.data);
      rawWorker.onerror = () => reject(new Error("Raw bridge worker failed"));
      rawWorker.postMessage(JSON.stringify(invalid));
    });
    if (
      raw.failures?.length !== 4 ||
      raw.failures.some(
        (failure) =>
          JSON.stringify(failure) !==
            JSON.stringify({ code: "wasm_backend_error", error: "Prover operation failed" }) &&
          JSON.stringify(failure) !==
            JSON.stringify({ error: "Prover operation failed", code: "wasm_backend_error" }),
      )
    ) {
      throw new Error("Raw Go bridge did not redact errors and panics");
    }
  } finally {
    rawWorker.terminate();
  }
  for (const threads of [0, 2]) {
    const prover = new ZolanaWebProver({
      wasmUrl: "/prover/zolana-prover.wasm",
      keyBaseUrl: "/keys",
      proverUrl: location.origin + "/local",
      threads,
      onMeasurement: (measurement) => measurements.push(measurement),
    });
    try {
      for (const value of [sentinel, { [sentinel]: sentinel }]) {
        const invalid = structuredClone(request);
        invalid.inputs[0].nullifierSecret = value;
        let rejected = false;
        try {
          await prover.proveRequest(JSON.stringify(invalid));
        } catch (error) {
          if (
            !(error instanceof WasmProverError) ||
            error.code !== "wasm_prove_failed" ||
            error.message.includes(sentinel) ||
            error.cause !== undefined
          )
            throw new Error("Unsafe API failure");
          rejected = true;
        }
        if (!rejected) throw new Error("Malformed witness accepted");
        const response = await prover.createFetch()(location.origin + "/local/prove", {
          method: "POST",
          body: JSON.stringify(invalid),
        });
        const failure = await response.json();
        if (
          response.status !== 500 ||
          failure.code !== "wasm_prove_failed" ||
          JSON.stringify(failure).includes(sentinel)
        )
          throw new Error("Unsafe fetch failure");
      }
      const result = await prover.proveRequest(JSON.stringify(request));
      const proof = JSON.parse(result.proof);
      if (!Array.isArray(proof.ar) || !Array.isArray(proof.bs) || !Array.isArray(proof.krs)) {
        throw new Error("Invalid protocol proof encoding");
      }
      results.push({ threads, proveMs: result.proveMs, verifyMs: result.verifyMs });
    } finally {
      prover.terminate();
    }
  }
  if (JSON.stringify(measurements).includes(sentinel)) throw new Error("Unsafe measurement");
  return results;
};
