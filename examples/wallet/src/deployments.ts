// Application configuration. Policies are reviewed JSON, never learned from a prover.
import { teePolicyFromJson } from "@heliuslabs/zolana/client";
import devnet from "../policies/devnet.json" with { type: "json" };
import mainnet from "../policies/mainnet.json" with { type: "json" };

/** Unwrap release files for compatibility with the published 0.6.0 parser. */
export function remoteProverConfig(proverUrl: string, policyFile: unknown) {
  const policy = policyFile !== null && typeof policyFile === "object" && "deployment" in policyFile
    ? policyFile.deployment : policyFile;
  return { proverUrl, proverTee: teePolicyFromJson(policy) };
}

export const deployments = {
  devnet: {
    solanaRpcUrl: "https://api.devnet.solana.com",
    indexerUrl: "https://d34xe1hqb2ibg2.cloudfront.net",
    ...remoteProverConfig("https://dd73hh473h6ha.cloudfront.net", devnet),
  },
  mainnet: {
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
    indexerUrl: "https://dgcj4pjarvo65.cloudfront.net",
    ...remoteProverConfig("https://d3ky2kt0ntqxt1.cloudfront.net", mainnet),
  },
} as const;
