/**
 * The transfer circuit shapes and the proving keys that back them.
 *
 * The shape list mirrors `SPP_SUPPORTED_SHAPES` in the SDK, `SupportedShapes` in
 * `prover-test/spp/protocol/shape.go`, and the on-chain verifier -- cheapest
 * first, so the order doubles as the smallest-fit search order.
 *
 * The sizes below exist only so the UI can total them before fetching anything.
 * `keys/manifest.json`, generated from `proving-keys.lock` by `zolana-prover-assets`, is
 * what a downloaded key is actually validated against -- a key rotation changes
 * every size and digest, and a copy in source silently goes stale across a
 * rebase.
 */

export interface Shape {
  readonly inputs: number;
  readonly outputs: number;
}

export interface ShapeKey extends Shape {
  /** `<in>x<out>`, the label used in the UI and benchmark tables. */
  readonly label: string;
  /** Proving-key file name, matching the CloudFront/S3 object name. */
  readonly keyFile: string;
  /** Proving-key size in bytes, from the committed lockfile. */
  readonly keyBytes: number;
}

function entry(inputs: number, outputs: number, keyBytes: number): ShapeKey {
  return Object.freeze({
    inputs,
    outputs,
    label: `${String(inputs)}x${String(outputs)}`,
    keyFile: `transfer_confidential_${String(inputs)}_${String(outputs)}.key`,
    keyBytes,
  });
}

/** Confidential (default transact) rail only, ring rail keys are out of scope. */
export const TRANSFER_SHAPES: readonly ShapeKey[] = Object.freeze([
  entry(1, 2, 9_268_057),
  entry(1, 4, 11_320_903),
  entry(1, 8, 13_695_140),
  entry(2, 2, 16_407_295),
  entry(2, 4, 17_416_909),
  entry(1, 16, 18_119_894),
  entry(2, 8, 21_887_446),
  entry(3, 2, 24_424_541),
  entry(3, 4, 25_433_887),
  entry(2, 16, 26_327_780),
  entry(3, 8, 27_804_471),
  entry(4, 2, 30_346_432),
  entry(4, 4, 31_361_454),
  entry(4, 8, 33_727_897),
  entry(5, 2, 36_449_879),
  entry(5, 4, 37_464_519),
  entry(4, 16, 38_204_323),
  entry(5, 8, 44_025_900),
  entry(6, 2, 46_571_502),
  entry(6, 4, 47_591_772),
  entry(5, 16, 48_520_274),
  entry(6, 8, 49_957_349),
  entry(8, 2, 58_604_067),
  entry(8, 4, 59_617_404),
  entry(8, 8, 62_007_104),
  entry(8, 16, 66_535_995),
  entry(12, 2, 90_894_233),
  entry(12, 4, 91_932_405),
  entry(12, 8, 94_355_203),
  entry(16, 2, 114_870_607),
  entry(16, 4, 115_913_395),
  entry(16, 8, 118_361_316),
  entry(24, 2, 179_892_108),
  entry(24, 4, 180_955_692),
  entry(32, 2, 228_023_589),
  entry(40, 2, 275_193_373),
  entry(48, 2, 356_237_189),
  entry(49, 2, 362_114_005),
]);

function mergeEntry(inputs: number, keyBytes: number): ShapeKey {
  return Object.freeze({
    inputs,
    outputs: 1,
    label: `merge ${String(inputs)}x1`,
    keyFile: `merge_${String(inputs)}_1.key`,
    keyBytes,
  });
}

/** The smallest merge circuit. */
export const MERGE_SHAPE: ShapeKey = mergeEntry(8, 55_767_611);

/** The merge circuits, by input count, mirroring `SupportedInputCounts` in `spp_merge/shared`. */
export const MERGE_SHAPES: readonly ShapeKey[] = Object.freeze([
  MERGE_SHAPE,
  mergeEntry(24, 173_052_578),
  mergeEntry(54, 379_646_246),
]);

export const MERGE_KEY_FILE = MERGE_SHAPE.keyFile;
export const MERGE_KEY_BYTES = MERGE_SHAPE.keyBytes;

/**
 * The proving key a `/prove` request needs, resolved from the request itself
 * rather than guessed ahead of time.
 *
 * The protocol derives the shape from the real input/output counts with a
 * smallest-fit rule, so a caller cannot reliably predict which key a given
 * transfer will use; reading it off the request is the only way to be right.
 * Mirrors the server's LazyKeyManager cache key.
 */
export function keyForProveRequest(
  circuitType: string,
  inputs: number,
  outputs: number,
): ShapeKey | undefined {
  if (circuitType === "merge")
    return MERGE_SHAPES.find((shape) => shape.inputs === inputs && shape.outputs === outputs);
  if (circuitType !== "transfer-confidential") return undefined;
  return TRANSFER_SHAPES.find(
    (shape) => shape.inputs === inputs && shape.outputs === outputs,
  );
}

/** Smallest shape that holds `inputs`/`outputs`, matching `CanonicalShape`. */
export function canonicalShape(inputs: number, outputs: number): ShapeKey {
  const found = TRANSFER_SHAPES.find(
    (shape) => inputs <= shape.inputs && outputs <= shape.outputs,
  );
  if (found === undefined) {
    throw new Error(`no supported shape holds ${String(inputs)}x${String(outputs)}`);
  }
  return found;
}

export function shapeByLabel(label: string): ShapeKey {
  const found = TRANSFER_SHAPES.find((shape) => shape.label === label);
  if (found === undefined) throw new Error(`unknown shape ${label}`);
  return found;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
