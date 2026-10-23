/**
 * The transfer and merge circuit shapes and the proving keys that back them.
 *
 * The shapes are the keys of the pinned key set, read from `key-digests.ts`
 * (generated from `zopro-keys.lock`, which a downloaded key is also checked
 * against), smallest key first, so the order doubles as the smallest-fit
 * search order; the set mirrors `SPP_SUPPORTED_SHAPES` in the SDK and the
 * on-chain verifier.
 */

import { KEY_DIGESTS } from "./key-digests.js";

export interface Shape {
  readonly inputs: number;
  readonly outputs: number;
}

export interface ShapeKey extends Shape {
  /** `<in>x<out>`, the label used in the UI and benchmark tables. */
  readonly label: string;
  /** The gnark proving key's file name, which names the circuit and its zopro key. */
  readonly keyFile: string;
  /** The zopro key file's size in bytes, from the pinned lockfile. */
  readonly keyBytes: number;
}

/** The pinned keys whose names match `pattern`, smallest first. */
function pinnedShapes(
  pattern: RegExp,
  shape: (inputs: number, outputs: number, keyFile: string, keyBytes: number) => ShapeKey,
): readonly ShapeKey[] {
  const shapes: ShapeKey[] = [];
  for (const [keyFile, { size }] of Object.entries(KEY_DIGESTS)) {
    const match = pattern.exec(keyFile);
    if (match !== null) shapes.push(shape(Number(match[1]), Number(match[2]), keyFile, size));
  }
  return Object.freeze(shapes.sort((a, b) => a.keyBytes - b.keyBytes));
}

/** Confidential (default transact) rail only, ring rail keys are out of scope. */
export const TRANSFER_SHAPES: readonly ShapeKey[] = pinnedShapes(
  /^transfer_confidential_(\d+)_(\d+)\.key$/u,
  (inputs, outputs, keyFile, keyBytes) =>
    Object.freeze({ inputs, outputs, label: `${String(inputs)}x${String(outputs)}`, keyFile, keyBytes }),
);

/**
 * The widest merge the browser proves. A wider merge key does not fit in
 * wasm32's 4 GB of memory beside the decoded form the prover caches.
 */
export const MAX_BROWSER_MERGE_INPUTS = 24;

/**
 * The merge circuits the browser proves, by input count: those of
 * `SupportedInputCounts` in `spp_merge/shared` up to `MAX_BROWSER_MERGE_INPUTS`.
 */
export const MERGE_SHAPES: readonly ShapeKey[] = Object.freeze(
  pinnedShapes(/^merge_(\d+)_(1)\.key$/u, (inputs, outputs, keyFile, keyBytes) =>
    Object.freeze({ inputs, outputs, label: `merge ${String(inputs)}x1`, keyFile, keyBytes }),
  ).filter((shape) => shape.inputs <= MAX_BROWSER_MERGE_INPUTS),
);
/** The smallest merge circuit. */
export const MERGE_SHAPE: ShapeKey = MERGE_SHAPES[0]!;

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

/**
 * The keys spends of up to `maxInputs` notes with `outputs` outputs, and merges of
 * up to `maxMergeInputs` notes, prove with, smallest first, as `prefetch` takes
 * them. A transfer has two outputs, the payment and the change; a withdrawal pads
 * its change to two. The mobile SDK's `ProvingKeys.needed`.
 */
export function neededKeys(
  maxInputs: number,
  outputs: readonly number[],
  maxMergeInputs: number,
): ShapeKey[] {
  const needed = new Set<ShapeKey>();
  for (let inputs = 1; inputs <= maxInputs; inputs++) {
    for (const count of outputs) needed.add(canonicalShape(inputs, count));
  }
  if (maxMergeInputs > MAX_BROWSER_MERGE_INPUTS) {
    throw new Error(
      `the browser merges at most ${String(MAX_BROWSER_MERGE_INPUTS)} notes, not ${String(maxMergeInputs)}`,
    );
  }
  // The narrowest merge that holds the notes, as the protocol's merge_circuit_width.
  for (let count = 2; count <= maxMergeInputs; count++) {
    const merge = MERGE_SHAPES.find((shape) => count <= shape.inputs);
    if (merge === undefined) throw new Error(`no supported merge holds ${String(count)} notes`);
    needed.add(merge);
  }
  return [...needed].sort((a, b) => a.keyBytes - b.keyBytes);
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
