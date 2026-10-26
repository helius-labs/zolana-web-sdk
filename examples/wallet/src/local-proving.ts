export const MAX_LOCAL_INPUTS = 8;
export const MERGE_FIRST = `Merge notes with the TEE first. Local proofs use at most ${MAX_LOCAL_INPUTS} inputs.`;

export function localSpendLimit(notes: readonly { readonly amount: bigint }[]): bigint {
  return [...notes]
    .sort((a, b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0)
    .slice(0, MAX_LOCAL_INPUTS)
    .reduce((total, note) => total + note.amount, 0n);
}

/** Enforce the demo's limit before a request reaches the local prover worker. */
export function limitLocalProofs(localFetch: typeof fetch, proverUrl: string): typeof fetch {
  const origin = new URL(proverUrl).origin;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === origin && /^\/prove(?:\/|$)/u.test(url.pathname)) {
      const request = new Request(input, init);
      if (request.method === "POST") {
        const body = await request.clone().json() as { inputs?: unknown };
        if (Array.isArray(body.inputs) && body.inputs.length > MAX_LOCAL_INPUTS) {
          throw new Error(MERGE_FIRST);
        }
      }
    }
    return localFetch(input, init);
  };
}
