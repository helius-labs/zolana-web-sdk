import { ZolanaWebProver } from "@heliuslabs/zolana-web-prover";

// The proofs main.ts makes, from an app webpack bundles.
window.checkPackedProver = async () => {
  const request = await (await fetch("/fixtures/transfer-2x2.json")).text();
  const results = [];
  for (const threads of [1, 2]) {
    const prover = new ZolanaWebProver({ keyBaseUrl: "/keys", proverUrl: location.origin + "/local", threads });
    try {
      const result = await prover.proveRequest(request);
      if (!Array.isArray(JSON.parse(result.proof).ar)) throw new Error("Invalid protocol proof encoding");
      results.push({ threads, proveMs: result.proveMs, verifyMs: result.verifyMs });
    } finally {
      prover.terminate();
    }
  }
  return results;
};
