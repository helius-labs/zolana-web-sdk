import { expect, it, vi } from "vitest";
import { catalogKeyUrls, type ProvingKeyCatalog } from "../src/key-catalog.js";
import { KEY_DIGESTS } from "../src/key-digests.js";
import { KeyStore } from "../src/key-store.js";
import { shapeByLabel } from "../src/shapes.js";

const name = "transfer_confidential_2_2.key";
const pin = KEY_DIGESTS[name]!;
const url = "https://keys.example/converted/old-prefix/key.bin?version=pinned";
const catalog = (): ProvingKeyCatalog => ({ keys: [{ name, artifacts: [
  { format: "gnark", sha256: pin.keySha256, size: 1, url: "https://keys.example/new-prefix/key.key" },
  { format: "zopro", sha256: pin.sha256, size: pin.size, url },
] }] });

it("uses the complete zopro URL despite a different gnark prefix", () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  const store = new KeyStore({ keyCatalog: catalog(), fetch });
  expect(store.url(shapeByLabel("2x2"))).toBe(url);
  expect(store.digest(shapeByLabel("2x2")).keySha256).toBe(pin.keySha256);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the catalog snapshot independent of caller mutations", () => {
  const value = structuredClone(catalog());
  const store = new KeyStore({ keyCatalog: value, fetch });
  (value.keys[0]!.artifacts[1]! as { url: string }).url = "https://changed.example";
  expect(store.url(shapeByLabel("2x2"))).toBe(url);
});

it("refuses mismatching gnark, zopro or size pins before downloading", () => {
  for (const [artifact, field, value] of [[0, "sha256", "0".repeat(64)], [1, "sha256", "0".repeat(64)], [1, "size", pin.size + 1]] as const) {
    const changed = structuredClone(catalog());
    Object.assign(changed.keys[0]!.artifacts[artifact]!, { [field]: value });
    expect(() => catalogKeyUrls(changed)).toThrow(expect.objectContaining({ code: "wasm_key_digest_mismatch" }));
  }
});

it("does not fall back for an absent key or gnark-only entry", () => {
  for (const value of [{ keys: [] }, { keys: [{ name, artifacts: [catalog().keys[0]!.artifacts[0]!] }] }]) {
    const store = new KeyStore({ keyCatalog: value, fetch });
    expect(() => store.url(shapeByLabel("2x2"))).toThrow(expect.objectContaining({ code: "wasm_key_manifest_error" }));
  }
});

it("ignores unsupported circuits without making them loadable", () => {
  const value = { keys: [...catalog().keys, { name: "future_circuit.key", artifacts: [] }] };
  expect([...catalogKeyUrls(value)]).toEqual([[name, url]]);
});

it("rejects ambiguous catalogs and conflicting source options", () => {
  const key = catalog().keys[0]!;
  for (const value of [null, {}, { prefix: "old", keys: [{ name, available: true }] },
    { keys: [key, key] }, { keys: [{ name, artifacts: [...key.artifacts, key.artifacts[0]] }] },
    { keys: [{ name, artifacts: [...key.artifacts, key.artifacts[1]] }] }]) {
    expect(() => catalogKeyUrls(value)).toThrow(expect.objectContaining({ code: "wasm_key_catalog_invalid" }));
  }
  expect(() => new KeyStore({ keyCatalog: catalog(), keyBaseUrl: "/keys", fetch })).toThrow();
});

it("allows HTTPS and loopback mirrors but rejects unsafe catalog URLs", () => {
  for (const replacement of ["file:///key", "http://remote.example/key", "https://user:secret@host/key", "https://host/key#fragment", "/relative/key"]) {
    const value = structuredClone(catalog());
    Object.assign(value.keys[0]!.artifacts[1]!, { url: replacement });
    expect(() => catalogKeyUrls(value)).toThrow(expect.objectContaining({ code: "wasm_key_catalog_invalid" }));
  }
  for (const replacement of ["http://127.0.0.1/key", "http://[::1]/key", "http://mirror.localhost/key"]) {
    const value = structuredClone(catalog());
    Object.assign(value.keys[0]!.artifacts[1]!, { url: replacement });
    expect(catalogKeyUrls(value).get(name)).toBe(replacement);
  }
});
