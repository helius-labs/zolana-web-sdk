// A devnet-only key kept in this browser's storage, standing in for a wallet
// extension. Never put real funds on it.
const STORAGE_KEY = "zolana-example-burner";

export function loadBurnerSeed(): Uint8Array {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null && /^[0-9a-f]{64}$/u.test(stored)) {
    return Uint8Array.from(stored.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(STORAGE_KEY, Array.from(seed, (byte) => byte.toString(16).padStart(2, "0")).join(""));
  return seed;
}

export function resetBurner(): void {
  localStorage.removeItem(STORAGE_KEY);
}
