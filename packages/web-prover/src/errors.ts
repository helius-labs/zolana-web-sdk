const messages = {
  wasm_prover_error: "Prover operation failed",
  wasm_init_failed:
    "Prover initialization failed; check runtime assets, threads and isolation headers",
  wasm_worker_failed: "Prover worker failed",
  wasm_worker_not_started: "Prover worker is not started",
  wasm_worker_terminated: "Prover worker terminated",
  wasm_invalid_response: "Invalid prover response",
  wasm_invalid_request: "Unsupported circuit or malformed request",
  wasm_key_manifest_error: "The proving key is not in the pinned key set",
  wasm_key_download_failed: "Proving-key download failed",
  wasm_key_digest_mismatch: "Proving key does not match the lockfile; stage the pinned assets",
  wasm_key_load_failed: "Proving-key loading failed",
  wasm_prove_failed: "Proof generation failed",
  wasm_verify_failed: "The proof did not verify",
} as const;

export type WasmProverErrorCode = keyof typeof messages;

export class WasmProverError extends Error {
  readonly code: WasmProverErrorCode;

  constructor(code: WasmProverErrorCode = "wasm_prover_error") {
    const safeCode = Object.hasOwn(messages, code) ? code : "wasm_prover_error";
    super(messages[safeCode]);
    this.name = "WasmProverError";
    this.code = safeCode;
  }
}

export function operationError(kind: string): WasmProverError {
  switch (kind) {
    case "init":
      return new WasmProverError("wasm_init_failed");
    case "loadKey":
      return new WasmProverError("wasm_key_load_failed");
    case "prove":
      return new WasmProverError("wasm_prove_failed");
    default:
      return new WasmProverError("wasm_worker_failed");
  }
}

/**
 * The error of a failed worker operation: the worker's code when it is one of
 * ours (a key built from another gnark key, a proof that did not verify), else
 * the operation's. The worker sends codes only, never messages.
 */
export function workerError(kind: string, code: unknown): WasmProverError {
  return typeof code === "string" && code !== "wasm_prover_error" && Object.hasOwn(messages, code)
    ? new WasmProverError(code as WasmProverErrorCode)
    : operationError(kind);
}
