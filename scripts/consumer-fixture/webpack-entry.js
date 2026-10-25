import { ZolanaWebProver, WasmProverError } from "@heliuslabs/zolana-web-prover";

// The proofs main.ts makes, from an app webpack bundles.
window.checkPackedProver = async () => {
  const request = await (await fetch("/fixtures/transfer-2x2.json")).json();
  const sentinel = "review-private-sentinel";
  const results = [];
  const threadCounts = crossOriginIsolated ? [0, 1, 2] : [0];
  for (const threads of threadCounts) {
    const prover = new ZolanaWebProver({
      keyBaseUrl: "/keys",
      proverUrl: location.origin + "/local",
      threads,
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
  return results;
};
