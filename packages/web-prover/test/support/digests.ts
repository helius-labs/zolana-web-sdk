/** Every pinned key is the three bytes of `key`; a test file passes this to `vi.mock`. */
export async function threeByteKeyDigests(
  importOriginal: () => Promise<typeof import("../../src/key-digests.js")>,
) {
  const original = await importOriginal();
  const digest = { size: 3, sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81" };
  const KEY_DIGESTS = Object.fromEntries(Object.keys(original.KEY_DIGESTS).map((name) => [name, digest]));
  return { ...original, KEY_DIGESTS };
}
