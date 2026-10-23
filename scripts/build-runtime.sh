#!/usr/bin/env bash
# Builds the prover runtime, zopro-zolana for the browser, at the zopro
# repository, path and revision runtime.lock.json pins, into the package's
# src/runtime with a manifest of its files (path, size, sha256); the package
# ships it beside the compiled worker and the app's bundler emits it. A runtime
# already built from the pinned revision is kept. ZOPRO_DIR builds from a
# checkout instead of a clone; the manifest records its revision. The request
# fixtures are staged for the example page and the proof timing harness.
#
# Without LTO: zopro-core's SIMD assembly does not assemble with simd128 in
# an rlib built for LTO.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pin() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(process.argv[2].split(".").reduce((o, k) => o[k], v))' "$root/runtime.lock.json" "$1"; }
rust_toolchain="$(pin rustToolchain)"
bindgen_version="$(pin wasmBindgen)"
revision="$(pin zopro.revision)"
out="$root/packages/web-prover/src/runtime"
fixtures="$root/examples/browser/public/fixtures"

# Whether $out holds exactly the files its manifest lists, built from the pins.
current() {
  RUST_TOOLCHAIN="$rust_toolchain" WASM_BINDGEN="$bindgen_version" node --input-type=module - "$out" "$revision" <<'NODE'
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const [out, revision] = process.argv.slice(2);
const manifest = JSON.parse(await readFile(join(out, "manifest.json"), "utf8").catch(() => "{}"));
const present = await readdir(out, { recursive: true, withFileTypes: true }).catch(() => []);
const ok =
  manifest.format === 2 &&
  manifest.zoproRevision === revision &&
  manifest.rustToolchain === process.env.RUST_TOOLCHAIN &&
  manifest.wasmBindgen === process.env.WASM_BINDGEN &&
  Array.isArray(manifest.files) &&
  present.filter((entry) => entry.isFile()).length === manifest.files.length + 1 &&
  (
    await Promise.all(
      manifest.files.map(async ({ path, size, sha256 }) => {
        const bytes = await readFile(join(out, path)).catch(() => undefined);
        return bytes?.length === size && createHash("sha256").update(bytes).digest("hex") === sha256;
      }),
    )
  ).every(Boolean);
process.exit(ok ? 0 : 1);
NODE
}

build() {
  local zopro built target bindgen
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
  # The helper imports the runtime by its directory, which webpack refuses in an
  # ES module; naming the file works in every bundler.
  local helpers=("$work"/bindgen/snippets/wasm-bindgen-rayon-*/src/workerHelpers.js)
  if [[ ${#helpers[@]} != 1 || ! -f "${helpers[0]}" ]]; then
    echo "Expected one Rayon worker helper in the runtime build" >&2
    exit 1
  fi
  replace "${helpers[0]}" "import('../../..')" "import('../../../zopro_zolana.js')"

  rm -rf "$out"
  mkdir -p "$out"
  install -m 644 "$work"/bindgen/zopro_zolana{.js,.d.ts,_bg.wasm} "$out/"
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
const helper = files.find(({ path }) => path.startsWith("snippets/") && path.endsWith("/workerHelpers.js"));
if (helper === undefined) throw new Error("the runtime is missing the thread pool's worker helper");
if (!(await readFile(join(out, helper.path), "utf8")).includes("import('../../../zopro_zolana.js')"))
  throw new Error("the thread pool's worker helper must import the runtime by its file name");
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
}

replace() {
  node -e '
    const fs = require("node:fs");
    const [file, from, to] = process.argv.slice(1);
    const text = fs.readFileSync(file, "utf8");
    if (text.split(from).length !== 2) {
      console.error(`Expected one ${from} in ${file}`);
      process.exit(1);
    }
    fs.writeFileSync(file, text.replace(from, () => to));
  ' "$@"
}

if [[ -z "${ZOPRO_DIR:-}" ]] && current; then
  echo "Using the runtime from zopro $revision in $out"
else
  build
fi
mkdir -p "$fixtures"
install -m 644 "$root"/fixtures/*.json "$fixtures/"
