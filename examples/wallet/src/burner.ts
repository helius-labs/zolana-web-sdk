// A demo signer kept in browser storage, standing in for a wallet extension.
// Each network and protocol release has its own testing key.
export const burnerStorageKey = (network: string) => `zolana-example-burner-v0.6.0-${network}`;

export function loadBurnerSeed(network: string): Uint8Array {
  const key = burnerStorageKey(network);
  const stored = localStorage.getItem(key);
  if (stored !== null && /^[0-9a-f]{64}$/u.test(stored)) {
    return Uint8Array.from(stored.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(key, Array.from(seed, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  return seed;
}

export function resetBurner(network: string): void {
  localStorage.removeItem(burnerStorageKey(network));
}
