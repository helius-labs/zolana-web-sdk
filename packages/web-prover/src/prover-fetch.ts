/**
 * A `fetch` for `ZolanaClientConfig.fetch`: proof requests to `/prove/<key>`
 * are answered by the local prover, other paths below `/prove` are refused, and
 * everything else is delegated, so one shim covers the client.
 */

import { abortable, rethrowAbort } from "./abortable.js";
import { WasmProverError } from "./errors.js";
import type { Measurement } from "./measurement.js";
import { isWideMerge, proofRequestShape, proveRoute } from "./proof-requests.js";

export interface ProverFetchOptions {
  /** The prover URL handed to the SDK; requests to it are intercepted. */
  readonly proverUrl: string;
  /** Where every other request goes. */
  readonly fetch: typeof globalThis.fetch;
  readonly onMeasurement?: (measurement: Measurement) => void;
  /** Proves one `/prove` body locally. */
  readonly prove: (body: string, signal?: AbortSignal) => Promise<Readonly<{ proof: string }>>;
}

export function createProverFetch(options: ProverFetchOptions): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input);
    const route = url === undefined ? undefined : proveRoute(url, options.proverUrl);
    if (route === undefined) return await options.fetch(input as RequestInfo, init);

    const signal =
      init?.signal !== undefined
        ? (init.signal ?? undefined)
        : input instanceof Request
          ? input.signal
          : undefined;
    signal?.throwIfAborted();
    try {
      if (route.kind === "unsupported") throw new WasmProverError("wasm_invalid_request");
      const body = await abortable(readBody(input, init), signal);
      if (body === undefined) throw new WasmProverError("wasm_invalid_request");
      if (isWideMerge(body)) throw new WasmProverError("wasm_merge_too_wide");
      // The path names the proving key; prove nothing the body does not match.
      if (route.keyFile !== undefined && proofRequestShape(body)?.keyFile !== route.keyFile) {
        throw new WasmProverError("wasm_invalid_request");
      }
      const result = await options.prove(body, signal);
      signal?.throwIfAborted();
      return new Response(result.proof, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      rethrowAbort(error, signal);
      return proverErrorResponse(error, options.onMeasurement);
    }
  };
}

function requestUrl(input: RequestInfo | URL): URL | undefined {
  try {
    if (typeof input === "string") return new URL(input);
    if (input instanceof URL) return input;
    return new URL(input.url);
  } catch {
    return undefined;
  }
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  if (typeof init?.body === "string") return init.body;
  if (input instanceof Request) return await input.clone().text();
  return undefined;
}

/**
 * A 500 carrying the reason, so the SDK's prover error path handles it as a
 * server rejection rather than a retryable transport fault.
 */
function proverErrorResponse(
  error: unknown,
  onMeasurement?: (measurement: Measurement) => void,
): Response {
  const safe = new WasmProverError(error instanceof WasmProverError ? error.code : undefined);
  onMeasurement?.({ step: "transfer-prove", ms: 0, note: safe.code });
  return new Response(JSON.stringify({ code: safe.code, message: safe.message }), {
    status: 500,
    headers: { "content-type": "application/json" },
  });
}
