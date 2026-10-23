#!/usr/bin/env node
// Installs pinned proving keys for an app that serves them itself: the zopro key
// file of each named key, checked against the size and SHA-256 the package
// bundles from zopro-keys.lock. Runs from the package's dist/scripts, beside key-digests.js.
import { join, relative, resolve } from "node:path";
import { existingFileMatches, loadAsset, verifyBytes, writeAtomically } from "./assets.mjs";
import { KEY_BASE_URL, KEY_DIGESTS } from "../key-digests.js";

const usage = "Usage: zolana-prover-keys --output <directory> --keys name1.key,name2.key";
const argumentsList = process.argv.slice(2);
const argumentsMap = new Map();
for (let index = 0; index < argumentsList.length; index += 2) {
  const flag = argumentsList[index];
  const value = argumentsList[index + 1];
  if (!["--output", "--keys"].includes(flag) || !value || value.startsWith("--") || argumentsMap.has(flag)) {
    throw new Error(usage);
  }
  argumentsMap.set(flag, value);
}
if (!argumentsMap.has("--output") || !argumentsMap.has("--keys")) throw new Error(usage);
const output = resolve(argumentsMap.get("--output"));
const selectedKeys = argumentsMap.get("--keys").split(",");
if (new Set(selectedKeys).size !== selectedKeys.length) {
  throw new Error("Select a list of distinct proving-key names");
}
for (const name of selectedKeys) {
  if (!Object.hasOwn(KEY_DIGESTS, name)) {
    throw new Error("Unsupported proving-key name; select a key the prover can load");
  }
}
// A file: URL to a local mirror of the key set; the same checks apply.
const baseUrl = process.env.ZOLANA_KEYS_BASE_URL || KEY_BASE_URL;
const shown = (path) => relative(process.cwd(), path) || ".";

for (const name of selectedKeys) {
  const entry = KEY_DIGESTS[name];
  const destination = join(output, entry.file);
  if (await existingFileMatches(destination, entry)) {
    console.log(`Using ${shown(destination)}`);
    continue;
  }
  const bytes = await loadAsset(baseUrl, entry.file);
  verifyBytes(entry.file, bytes, entry);
  await writeAtomically(destination, bytes);
  console.log(`Installed ${shown(destination)}`);
}
