import { KEY_DIGESTS } from "./key-digests.js";
import { WasmProverError } from "./errors.js";

/** The public /proving-keys download catalog, independent of proof routing. */
export interface ProvingKeyCatalog {
  readonly keys: readonly Readonly<{
    name: string;
    artifacts: readonly Readonly<{
      format: "gnark" | "zopro";
      sha256: string;
      size: number;
      url: string;
    }>[];
  }>[];
}

/** Select URLs only for conversions whose bytes and source key we already pin. */
export function catalogKeyUrls(catalog: unknown): ReadonlyMap<string, string> {
  const invalid = () => new WasmProverError("wasm_key_catalog_invalid");
  const record = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw invalid();
    return value as Record<string, unknown>;
  };
  const keys = record(catalog)["keys"];
  if (!Array.isArray(keys)) throw invalid();
  const urls = new Map<string, string>();
  const seen = new Set<string>();
  for (const raw of keys) {
    const key = record(raw);
    const name = key["name"];
    const artifacts = key["artifacts"];
    if (typeof name !== "string" || seen.has(name) || !Array.isArray(artifacts)) throw invalid();
    seen.add(name);
    // A catalog may list circuits this runtime cannot load.
    if (!Object.hasOwn(KEY_DIGESTS, name)) continue;
    const pinned = KEY_DIGESTS[name]!;
    const entries = artifacts.map(record);
    const gnark = entries.filter((entry) => entry["format"] === "gnark");
    const zopro = entries.filter((entry) => entry["format"] === "zopro");
    if (gnark.length !== 1 || zopro.length > 1) throw invalid();
    if (gnark[0]!["sha256"] !== pinned.keySha256)
      throw new WasmProverError("wasm_key_digest_mismatch");
    // A gnark-only download does not make a local zopro key available.
    const artifact = zopro[0];
    if (artifact === undefined) continue;
    if (artifact["sha256"] !== pinned.sha256 || artifact["size"] !== pinned.size)
      throw new WasmProverError("wasm_key_digest_mismatch");
    if (typeof artifact["url"] !== "string") throw invalid();
    let url: URL;
    try {
      url = new URL(artifact["url"]);
    } catch {
      throw invalid();
    }
    const loopback =
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username !== "" || url.password !== "" || url.hash !== ""
    ) throw invalid();
    urls.set(name, url.href);
  }
  return urls;
}
