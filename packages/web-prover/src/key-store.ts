/**
 * Proving keys in the browser's Cache API.
 *
 * Keys are zopro key files of 7-315 MB each and immutable (the lockfile pins
 * their sha256 and the CloudFront prefix is version-hashed), so re-downloading
 * one per page load is pure waste. A key downloads in ranged parts, several at
 * a time, each kept as it arrives, so an interrupted download resumes with the
 * parts it lacks. After a shape's first load the store keeps the runtime's raw
 * form instead of the pinned file's parts: the pinned file's compressed points
 * take seconds to decompress in wasm on every load, and the raw form skips that
 * and the solver's build.
 */

import { abortable, rethrowAbort } from "./abortable.js";
import { WasmProverError } from "./errors.js";
import { KEY_BASE_URL, KEY_DIGESTS, KEY_SET } from "./key-digests.js";
import { MERGE_SHAPES, TRANSFER_SHAPES, type ShapeKey } from "./shapes.js";

/** One entry of `KEY_DIGESTS`, copied from `zopro-keys.lock`. */
export interface KeyDigest {
  /** The zopro key file, the object name under the key base URL. */
  readonly file: string;
  readonly size: number;
  readonly sha256: string;
  /** The gnark proving key the file was built from, which proofs report. */
  readonly keySha256: string;
}

/** A proving key the prover can load and how much of it the browser keeps. */
export interface ProvingKeyStatus {
  /** The gnark proving key's name, as `ShapeKey.keyFile`. */
  readonly keyFile: string;
  /** The zopro key file's size in the lockfile. */
  readonly size: number;
  /**
   * Bytes the browser keeps: `size` once the key downloaded, what an interrupted
   * download left otherwise.
   */
  readonly downloaded: number;
  /** Whether its decoded form is kept, so its next load skips decompression. */
  readonly decoded: boolean;
}

/** A key's bytes: the pinned file, or the raw form the runtime wrote at an earlier load. */
export type KeyBytes = Readonly<{
  bytes: ArrayBuffer;
  raw: boolean;
  source: "cache" | "network";
  /** Whether the store can keep this key's raw form. */
  cacheable: boolean;
}>;

export interface KeyStoreOptions {
  /** Where keys are fetched from; the pinned key set on the Zolana CDN by default. */
  readonly keyBaseUrl?: string;
  readonly fetch: typeof globalThis.fetch;
  /** Ask the browser to keep the keys under storage pressure. */
  readonly persistStorage?: boolean;
}

export class KeyStore {
  readonly #options: KeyStoreOptions;
  #prepared = false;
  #cache: Cache | undefined;

  constructor(options: KeyStoreOptions) {
    this.#options = options;
  }

  /** The URL of the shape's zopro key file. */
  url(shape: ShapeKey): string {
    return `${(this.#options.keyBaseUrl ?? KEY_BASE_URL).replace(/\/+$/u, "")}/${this.digest(shape).file}`;
  }

  /** The shape's pinned key file, size and sha256; a shape outside the key set has none. */
  digest(shape: ShapeKey): KeyDigest {
    const expected = KEY_DIGESTS[shape.keyFile];
    if (expected === undefined) throw new WasmProverError("wasm_key_manifest_error");
    return expected;
  }

  /** Every key, smallest first, with what the browser keeps of it. */
  async status(signal: AbortSignal): Promise<readonly ProvingKeyStatus[]> {
    const cache = await this.#open(signal);
    const statuses: ProvingKeyStatus[] = [];
    for (const shape of [...TRANSFER_SHAPES, ...MERGE_SHAPES].sort((a, b) => a.keyBytes - b.keyBytes)) {
      const expected = KEY_DIGESTS[shape.keyFile];
      if (expected === undefined) continue;
      const status = { keyFile: shape.keyFile, size: expected.size, downloaded: 0, decoded: false };
      statuses.push(status);
      if (cache === undefined) continue;
      const url = this.url(shape);
      const raw = await optionalCache(() => cache.match(rawKeyUrl(url)), signal);
      if (raw?.headers.get(rawSourceHeader) === expected.sha256) {
        status.decoded = true;
        status.downloaded = expected.size;
      } else if ((await optionalCache(() => cache.match(url), signal)) !== undefined) {
        status.downloaded = expected.size;
      } else {
        status.downloaded = await keptBytes(cache, url, expected.size, signal);
      }
    }
    return statuses;
  }

  /** Removes the kept keys, their raw forms and interrupted downloads. */
  async clear(signal: AbortSignal): Promise<void> {
    this.#cache = undefined;
    await optionalCache(() => globalThis.caches?.delete(keyCacheName), signal);
  }

  /** Whether the store keeps this shape's raw form, written by a runtime of `rawKeyFormat`. */
  async rawKept(shape: ShapeKey, rawKeyFormat: string, signal: AbortSignal): Promise<boolean> {
    const expected = KEY_DIGESTS[shape.keyFile];
    const cache = await this.#open(signal);
    if (expected === undefined || cache === undefined) return false;
    const hit = await optionalCache(() => cache.match(rawKeyUrl(this.url(shape))), signal);
    return (
      hit?.headers.get(rawSourceHeader) === expected.sha256 &&
      hit.headers.get(rawFormatHeader) === rawKeyFormat
    );
  }

  /**
   * The shape's key: its raw form when kept, else the pinned file from the
   * cache or, downloaded in parts, from the network.
   */
  async load(
    shape: ShapeKey,
    rawKeyFormat: string,
    signal: AbortSignal,
    downloaded?: (loaded: number) => void,
  ): Promise<KeyBytes> {
    const url = this.url(shape);
    const expected = this.digest(shape);
    const cache = await this.#open(signal);
    return (
      (await this.#cachedRaw(cache, url, expected, rawKeyFormat, signal)) ??
      (await this.#pinned(cache, url, expected, signal, downloaded))
    );
  }

  /** The pinned file, after forgetting a raw form the runtime rejected. */
  async reload(
    shape: ShapeKey,
    signal: AbortSignal,
    downloaded?: (loaded: number) => void,
  ): Promise<KeyBytes> {
    const url = this.url(shape);
    const expected = this.digest(shape);
    const cache = await this.#open(signal);
    await optionalCache(() => cache?.delete(rawKeyUrl(url)), signal);
    return this.#pinned(cache, url, expected, signal, downloaded);
  }

  /** Keeps the raw form in place of the pinned file and its parts, which are no longer read. */
  async keepRaw(
    shape: ShapeKey,
    rawKeyFormat: string,
    raw: Uint8Array<ArrayBuffer>,
    signal: AbortSignal,
  ): Promise<void> {
    const url = this.url(shape);
    const expected = this.digest(shape);
    const cache = await this.#open(signal);
    if (cache === undefined) return;
    const headers = {
      "content-type": "application/octet-stream",
      [rawSourceHeader]: expected.sha256,
      [rawFormatHeader]: rawKeyFormat,
      [rawSizeHeader]: String(raw.byteLength),
    };
    const stored = await optionalCache(async () => {
      await cache.put(rawKeyUrl(url), new Response(raw, { headers }));
      return true;
    }, signal);
    if (stored !== true) return;
    await optionalCache(() => cache.delete(url), signal);
    await deleteParts(cache, url, expected.size, signal);
  }

  /**
   * Opens this key set's cache, once. The first call also deletes the stores
   * of other key sets, so a rotation frees its keys at once, and asks for
   * persistence when the caller opted in.
   */
  async #open(signal: AbortSignal): Promise<Cache | undefined> {
    if (this.#cache !== undefined) return this.#cache;
    if (!this.#prepared) {
      this.#prepared = true;
      const names = await optionalCache(() => globalThis.caches?.keys(), signal);
      for (const name of names ?? []) {
        if (name.startsWith(keyCachePrefix) && name !== keyCacheName)
          await optionalCache(() => globalThis.caches?.delete(name), signal);
      }
      if (this.#options.persistStorage === true)
        await optionalCache(() => globalThis.navigator?.storage?.persist(), signal);
    }
    this.#cache = await optionalCache(() => globalThis.caches?.open(keyCacheName), signal);
    return this.#cache;
  }

  /**
   * The raw re-encoding kept by an earlier load, if it was derived from this
   * pinned key by a runtime writing the same format and has its full size. It is
   * not hashed again on every load: a damaged entry fails the runtime's load and
   * is rebuilt from the pinned key, and a proof is verified before it returns.
   */
  async #cachedRaw(
    cache: Cache | undefined,
    url: string,
    expected: KeyDigest,
    rawKeyFormat: string,
    signal: AbortSignal,
  ): Promise<KeyBytes | undefined> {
    if (cache === undefined) return undefined;
    const hit = await optionalCache(() => cache.match(rawKeyUrl(url)), signal);
    if (hit === undefined) return undefined;
    const size = Number(hit.headers.get(rawSizeHeader));
    if (
      hit.headers.get(rawSourceHeader) === expected.sha256 &&
      hit.headers.get(rawFormatHeader) === rawKeyFormat &&
      Number.isSafeInteger(size)
    ) {
      const bytes = await optionalCache(() => hit.arrayBuffer(), signal);
      if (bytes?.byteLength === size) return { bytes, raw: true, source: "cache", cacheable: true };
    }
    // Derived from another key set or by another runtime, or damaged.
    await optionalCache(() => cache.delete(rawKeyUrl(url)), signal);
    return undefined;
  }

  async #pinned(
    cache: Cache | undefined,
    url: string,
    expected: KeyDigest,
    signal: AbortSignal,
    downloaded?: (loaded: number) => void,
  ): Promise<KeyBytes> {
    const cacheable = cache !== undefined;
    if (cache !== undefined) {
      const hit = await optionalCache(() => cache.match(url), signal);
      if (hit !== undefined) {
        const cached = await optionalCache(() => hit.arrayBuffer(), signal);
        if (cached !== undefined && (await abortable(matchesDigest(cached, expected), signal)))
          return { bytes: cached, raw: false, source: "cache", cacheable };
        // Written before a rotation: same shape, different circuit. Evict rather
        // than prove against it.
        await optionalCache(() => cache.delete(url), signal);
      }
    }

    if (cache === undefined) {
      const bytes = await this.#download(url, expected.size, signal, downloaded);
      if (!(await abortable(matchesDigest(bytes, expected), signal)))
        throw new WasmProverError("wasm_key_digest_mismatch");
      return { bytes, raw: false, source: "network", cacheable };
    }
    let parts = await this.#downloadInParts(cache, url, expected.size, signal, downloaded);
    let valid = await abortable(matchesDigest(parts.bytes, expected), signal);
    if (!valid && parts.resumed) {
      // A part an earlier download left was stale or damaged: start over once.
      await deleteParts(cache, url, expected.size, signal);
      parts = await this.#downloadInParts(cache, url, expected.size, signal, downloaded, false);
      valid = await abortable(matchesDigest(parts.bytes, expected), signal);
    }
    if (!valid) {
      await deleteParts(cache, url, expected.size, signal);
      throw new WasmProverError("wasm_key_digest_mismatch");
    }
    // The parts are the kept file; a key a host sent whole is kept whole.
    if (parts.whole) await optionalCache(() => cache.put(url, new Response(parts.bytes.slice(0))), signal);
    return { bytes: parts.bytes, raw: false, source: parts.fetched ? "network" : "cache", cacheable };
  }

  async #download(
    url: string,
    size: number,
    signal: AbortSignal,
    downloaded?: (loaded: number) => void,
  ): Promise<ArrayBuffer> {
    const response = await abortable(this.#options.fetch(url, { signal }), signal);
    if (!response.ok) throw new WasmProverError("wasm_key_download_failed");
    return abortable(readKey(response, size, downloaded), signal);
  }

  /**
   * Downloads a key in ranged parts, each kept in the cache as it arrives, so an
   * interrupted download resumes with the parts it lacks. The first part
   * missing goes alone: a host that ignores ranges answers it with the whole
   * key, which is taken instead (`whole`). The others go `keyPartsAtOnce` at a
   * time. `resumed` says whether parts an earlier download left were used,
   * `fetched` whether any part came from the network; `resume: false` ignores
   * kept parts.
   */
  async #downloadInParts(
    cache: Cache,
    url: string,
    size: number,
    signal: AbortSignal,
    downloaded?: (loaded: number) => void,
    resume = true,
  ): Promise<Readonly<{ bytes: ArrayBuffer; resumed: boolean; fetched: boolean; whole: boolean }>> {
    const bytes = new Uint8Array(size);
    const missing: number[] = [];
    let received = 0;
    for (let index = 0; index * keyPartBytes < size; index++) {
      const start = index * keyPartBytes;
      const length = Math.min(keyPartBytes, size - start);
      const hit = resume ? await optionalCache(() => cache.match(partUrl(url, index)), signal) : undefined;
      const kept = hit === undefined ? undefined : await optionalCache(() => hit.arrayBuffer(), signal);
      if (kept?.byteLength === length) {
        bytes.set(new Uint8Array(kept), start);
        received += length;
      } else missing.push(index);
    }
    const resumed = received > 0;
    if (resumed) downloaded?.(received);
    const fetched = missing.length > 0;

    // Part `index`, kept; or the whole key, when the host ignored the range.
    const fetchPart = async (index: number): Promise<ArrayBuffer | undefined> => {
      const start = index * keyPartBytes;
      const end = Math.min(start + keyPartBytes, size);
      const response = await abortable(
        this.#options.fetch(url, {
          signal,
          headers: { range: `bytes=${String(start)}-${String(end - 1)}` },
        }),
        signal,
      );
      if (response.status !== 200 && response.status !== 206) {
        throw new WasmProverError("wasm_key_download_failed");
      }
      let reported = 0;
      const part = await abortable(
        readKey(response, size, (loaded) => {
          received += loaded - reported;
          reported = loaded;
          downloaded?.(Math.min(received, size));
        }),
        signal,
      );
      // Told apart by length, not status: a host without ranges answers 200 with the
      // whole key, and an extension's own files answer 200 with just the range.
      if (response.status === 200 && part.byteLength === size) return part;
      if (part.byteLength !== end - start) throw new WasmProverError("wasm_key_download_failed");
      bytes.set(new Uint8Array(part), start);
      await optionalCache(() => cache.put(partUrl(url, index), new Response(part)), signal);
      return undefined;
    };

    const first = missing.shift();
    if (first !== undefined) {
      const whole = await fetchPart(first);
      if (whole !== undefined) {
        await deleteParts(cache, url, size, signal);
        return { bytes: whole, resumed: false, fetched, whole: true };
      }
    }
    // A failed part keeps the others from starting; those under way finish and
    // are kept for the next attempt.
    let failure: Readonly<{ error: unknown }> | undefined;
    const fetchMissing = async () => {
      for (let index = missing.shift(); index !== undefined && failure === undefined; index = missing.shift()) {
        try {
          if ((await fetchPart(index)) !== undefined) throw new WasmProverError("wasm_key_download_failed");
        } catch (error) {
          failure ??= { error };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(keyPartsAtOnce, missing.length) }, fetchMissing));
    if (failure !== undefined) throw failure.error;
    return { bytes: bytes.buffer, resumed, fetched, whole: false };
  }
}

/** The prefix of every key set's store; stores of other key sets are deleted. */
const keyCachePrefix = "zolana-proving-keys";
const keyCacheName = `${keyCachePrefix}-${KEY_SET}`;
const rawSourceHeader = "x-zolana-pinned-sha256";
const rawFormatHeader = "x-zolana-raw-format";
const rawSizeHeader = "x-zolana-raw-size";
/**
 * Bytes per ranged request of a download, as the mobile SDK's: what a resumed
 * download repeats at most.
 */
const keyPartBytes = 8 << 20;
/**
 * Ranged requests in flight. A CDN edge that does not hold a key answers each
 * range from its origin: one at a time a key came at about 13 MiB/s, four at a
 * time at about 45 (from an edge that holds it, 43 against 76).
 */
const keyPartsAtOnce = 4;

/** The Cache API ignores fragments, so the raw entry gets its own query. */
function rawKeyUrl(url: string): string {
  return `${url}?zolana-key=raw`;
}

/** Where part `index` of an interrupted download is kept. */
function partUrl(url: string, index: number): string {
  return `${url}?zolana-key=part-${String(index)}`;
}

/**
 * How many bytes of a download of `size` bytes the cache keeps in parts. The
 * first part goes alone, so a download that kept any kept that one.
 */
async function keptBytes(cache: Cache, url: string, size: number, signal: AbortSignal): Promise<number> {
  let kept = 0;
  for (let index = 0; index * keyPartBytes < size; index++) {
    if ((await optionalCache(() => cache.match(partUrl(url, index)), signal)) !== undefined)
      kept += Math.min(keyPartBytes, size - index * keyPartBytes);
    else if (index === 0) break;
  }
  return kept;
}

async function deleteParts(cache: Cache, url: string, size: number, signal: AbortSignal): Promise<void> {
  for (let index = 0; index * keyPartBytes < size; index++)
    await optionalCache(() => cache.delete(partUrl(url, index)), signal);
}

/** Reads a key body, reporting bytes as they arrive and stopping past the pinned size. */
async function readKey(
  response: Response,
  size: number,
  downloaded?: (loaded: number) => void,
): Promise<ArrayBuffer> {
  const reader = downloaded === undefined ? undefined : response.body?.getReader();
  if (reader === undefined) return response.arrayBuffer();
  const bytes = new Uint8Array(size);
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.byteLength > size) {
      await reader.cancel();
      throw new WasmProverError("wasm_key_digest_mismatch");
    }
    bytes.set(value, loaded);
    loaded += value.byteLength;
    downloaded?.(loaded);
  }
  return loaded === size ? bytes.buffer : bytes.buffer.slice(0, loaded);
}

async function sha256Hex(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function matchesDigest(bytes: ArrayBuffer, expected: KeyDigest): Promise<boolean> {
  // Size first: it is free and rejects the common case (a dev server with no keys
  // staged answers 200 with its SPA fallback HTML) without hashing megabytes.
  if (bytes.byteLength !== expected.size) return false;
  return (await sha256Hex(bytes)) === expected.sha256;
}

/** Cache API access is best effort: a failure falls back to the network, a cancellation does not. */
async function optionalCache<T>(
  operation: () => T | Promise<T>,
  signal: AbortSignal,
): Promise<T | undefined> {
  try {
    return await abortable(Promise.resolve().then(operation), signal);
  } catch (error) {
    rethrowAbort(error, signal);
    return undefined;
  }
}
