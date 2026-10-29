// Live read-only checks. No wallet, signer or transaction submission is used.
import assert from "node:assert/strict";
import { createZolanaClient } from "@heliuslabs/zolana";
import { address } from "@solana/kit";
import { ZOLANA_PROGRAM_IDS } from "../packages/web-prover/src/protocol.ts";
import { deployments } from "../examples/wallet/src/deployments.ts";

const genesis = {
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
};

for (const network of ["devnet", "mainnet"] as const) {
  try {
    const deployment = deployments[network];
    const client = await createZolanaClient({
      ...deployment,
      solanaRpcUrl: process.env[`ZOLANA_${network.toUpperCase()}_RPC_URL`] ?? deployment.solanaRpcUrl,
    });
    assert.equal(await client.solanaRpc.getGenesisHash().send(), genesis[network]);
    const programs = Object.values(ZOLANA_PROGRAM_IDS).map((id) => address(id));
    const { value: accounts } = await client.solanaRpc.getMultipleAccounts(programs, { encoding: "base64" }).send();
    assert.equal(accounts.length, programs.length);
    for (const account of accounts) assert.equal(account?.executable, true);
    const response = await fetch(deployment.indexerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getIndexerHealth", params: [] }),
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { result?: unknown }).result, "ok");
    await client.attestProver();
    console.log(`${network}: genesis, v0.6 programs, Photon health and Nitro attestation verified`);
  } catch (error) {
    // RPC URLs can contain credentials. Do not print transport error details.
    console.error(`${network}: deployment check failed (${error instanceof Error ? error.name : "unknown error"})`);
    process.exitCode = 1;
  }
}
