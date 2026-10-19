import { ZolanaWebProver, WasmProverError, type Measurement } from "@heliuslabs/zolana-web-prover";

declare global {
  interface Window {
    checkPackedProver: () => Promise<unknown>;
  }
}

window.checkPackedProver = async () => {
  const request = await (await fetch("/fixtures/transfer-2x2.json")).json();
  const sentinel = "review-private-sentinel";
  const measurements: Measurement[] = [];
  const results: unknown[] = [];
  for (const threads of [1, 2]) {
    const prover = new ZolanaWebProver({
      runtimeUrl: "/prover/",
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
        const response = await prover.createFetch()(location.origin + "/local/prove/transfer_confidential_2_2", {
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
