/**
 * The transfer circuit shapes and the proving keys that back them.
 *
 * The shape list mirrors `SPP_SUPPORTED_SHAPES` in the SDK, `SupportedShapes` in
 * `prover-test/spp/protocol/shape.go`, and the on-chain verifier -- cheapest
 * first, so the order doubles as the smallest-fit search order.
 *
 * Key sizes come from `key-digests.ts`, generated from `zopro-keys.lock`, which
 * is also what a downloaded key is validated against.
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

function pinnedSize(keyFile: string): number {
  const digest = KEY_DIGESTS[keyFile];
  if (digest === undefined) throw new Error(`${keyFile} is not in the pinned key set`);
  return digest.size;
}

function entry(inputs: number, outputs: number): ShapeKey {
  const keyFile = `transfer_confidential_${String(inputs)}_${String(outputs)}.key`;
  return Object.freeze({
    inputs,
    outputs,
    label: `${String(inputs)}x${String(outputs)}`,
    keyFile,
    keyBytes: pinnedSize(keyFile),
  });
}

/** Confidential (default transact) rail only, ring rail keys are out of scope. */
export const TRANSFER_SHAPES: readonly ShapeKey[] = Object.freeze([
  entry(1, 2),
  entry(1, 4),
  entry(1, 8),
  entry(2, 2),
  entry(2, 4),
  entry(1, 16),
  entry(2, 8),
  entry(3, 2),
  entry(3, 4),
  entry(2, 16),
  entry(3, 8),
  entry(4, 2),
  entry(4, 4),
  entry(4, 8),
  entry(5, 2),
  entry(5, 4),
  entry(4, 16),
  entry(5, 8),
  entry(6, 2),
  entry(6, 4),
  entry(5, 16),
  entry(6, 8),
  entry(8, 2),
  entry(8, 4),
  entry(8, 8),
  entry(8, 16),
  entry(12, 2),
  entry(12, 4),
  entry(12, 8),
  entry(16, 2),
  entry(16, 4),
  entry(16, 8),
  entry(24, 2),
  entry(24, 4),
  entry(32, 2),
  entry(40, 2),
  entry(48, 2),
  entry(49, 2),
]);

function mergeEntry(inputs: number): ShapeKey {
  const keyFile = `merge_${String(inputs)}_1.key`;
  return Object.freeze({
    inputs,
    outputs: 1,
    label: `merge ${String(inputs)}x1`,
    keyFile,
    keyBytes: pinnedSize(keyFile),
  });
}

/** The smallest merge circuit. */
export const MERGE_SHAPE: ShapeKey = mergeEntry(8);

/** The merge circuits, by input count, mirroring `SupportedInputCounts` in `spp_merge/shared`. */
export const MERGE_SHAPES: readonly ShapeKey[] = Object.freeze([
  MERGE_SHAPE,
  mergeEntry(24),
  mergeEntry(54),
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
