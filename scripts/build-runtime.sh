#!/usr/bin/env bash
# Builds the prover runtime, zopro-zolana for the browser, at the zopro
# repository, path and revision runtime.lock.json pins, into dist/runtime
# with a manifest of its files (path, size, sha256). The package bundles it and `npm run setup`
# installs it under examples/browser/public/prover. ZOPRO_DIR builds from
# a checkout instead of a clone; the manifest records its revision.
#
# Without LTO: zopro-core's SIMD assembly does not assemble with simd128 in
# an rlib built for LTO.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(process.argv[2].split(".").reduce((o, k) => o[k], v))' "$root/runtime.lock.json" "$1"; }
rust_toolchain="$(pin rustToolchain)"
bindgen_version="$(pin wasmBindgen)"
revision="$(pin zopro.revision)"
work="$(mktemp -d "${TMPDIR:-/tmp}/zolana-runtime.XXXXXX")"
trap 'rm -rf "$work"' EXIT

if [[ -n "${ZOPRO_DIR:-}" ]]; then
  zopro="$(cd "$ZOPRO_DIR" && pwd)"
  built="$(git -C "$zopro" rev-parse HEAD)"
  [[ -z "$(git -C "$zopro" status --porcelain)" ]] || built="$built-dirty"
  [[ "$built" == "$revision" ]] || echo "note: building zopro $built, runtime.lock.json pins $revision" >&2
else
  zopro="$work/zopro"
  git init -q "$zopro"
  git -C "$zopro" remote add origin "$(pin zopro.repository)"
  git -C "$zopro" fetch -q --depth=1 origin "$revision"
  git -C "$zopro" checkout -q FETCH_HEAD
  built="$revision"
  # zopro lives in a directory of the repository.
  zopro="$zopro/$(pin zopro.path)"
fi
target="${CARGO_TARGET_DIR:-$root/target/zopro-wasm}"

(cd "$zopro/crates/zopro-zolana" && CARGO_TARGET_DIR="$target" CARGO_PROFILE_RELEASE_LTO=false \
  rustup run "$rust_toolchain" cargo rustc --release --locked --target wasm32-unknown-unknown \
  --crate-type cdylib --features wgpu)
bindgen="$(command -v wasm-bindgen || true)"
if [[ -z "$bindgen" || "$("$bindgen" --version)" != "wasm-bindgen $bindgen_version" ]]; then
  bindgen="$HOME/Library/Caches/.wasm-pack/wasm-bindgen-cargo-install-$bindgen_version/wasm-bindgen"
fi
if [[ ! -x "$bindgen" ]]; then
  echo "wasm-bindgen $bindgen_version is required (cargo install wasm-bindgen-cli --version $bindgen_version)" >&2
  exit 1
fi
"$bindgen" --target web --out-name zopro_zolana --out-dir "$work/bindgen" \
  "$target/wasm32-unknown-unknown/release/zopro_zolana.wasm"

out="$root/dist/runtime"
rm -rf "$out"
mkdir -p "$out"
install -m 644 "$work/bindgen/zopro_zolana.js" "$work/bindgen/zopro_zolana_bg.wasm" "$out/"
cp -R "$work/bindgen/snippets" "$out/snippets"
install -m 644 "$zopro/crates/zopro-core/LICENSE-APACHE" "$zopro/crates/zopro-core/LICENSE-MIT" "$out/"
ZOPRO_REVISION="$built" RUST_TOOLCHAIN="$rust_toolchain" WASM_BINDGEN="$bindgen_version" node --input-type=module - "$out" <<'NODE'
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
const out = process.argv[2];
const files = [];
for (const entry of await readdir(out, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  const bytes = await readFile(path);
  files.push({
    path: relative(out, path).split("\\").join("/"),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
files.sort((a, b) => a.path.localeCompare(b.path));
if (!files.some(({ path }) => path.startsWith("snippets/") && path.endsWith("/workerHelpers.no-bundler.js")))
  throw new Error("the runtime is missing the thread pool's worker helper");
const manifest = {
  format: 2,
  zoproRevision: process.env.ZOPRO_REVISION,
  rustToolchain: process.env.RUST_TOOLCHAIN,
  wasmBindgen: process.env.WASM_BINDGEN,
  files,
};
await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
NODE
echo "runtime $(shasum -a 256 "$out/zopro_zolana_bg.wasm" | cut -c1-12) from zopro $built in $out"
