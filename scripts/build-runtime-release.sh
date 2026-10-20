#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-}"
mopro="${2:-}"
mopro_revision="d352504704d83c5a4a2eae9d42d7db9b4ab3f80e"
rust_toolchain="nightly-2025-11-15"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || -z "$mopro" ]]; then
  echo "Usage: npm run build:runtime -- <version> <pinned-mopro-checkout>" >&2
  exit 1
fi
mopro="$(cd "$mopro" && pwd)"
if [[ "$(git -C "$mopro" rev-parse HEAD)" != "$mopro_revision" ]]; then
  echo "Mopro checkout must be at $mopro_revision" >&2
  exit 1
fi
if [[ "$(wasm-pack --version)" != "wasm-pack 0.15.0" ]]; then
  echo "wasm-pack 0.15.0 is required" >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/zolana-web-runtime.XXXXXX")"
trap 'rm -rf "$work"' EXIT
staging="$work/staging"
mkdir -p "$staging/accelerator"

echo "Building the pinned Mopro accelerator..."
rustup component add rust-src --toolchain "$rust_toolchain"
(cd "$mopro/cli" && rustc --edition=2021 build.rs -o "$work/stage-templates")
(cd "$mopro/cli" && OUT_DIR="$work/templates" "$work/stage-templates")
accelerator="$work/templates/init-template/gnark-web/accelerator"
# Mopro's template builds Rayon's helpers for pages without a bundler, which start
# their threads from blob: URLs that extension pages refuse; the app's bundler emits
# these helpers as files instead.
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
replace "$accelerator/Cargo.toml" \
  'wasm-bindgen-rayon = { version = "1.3", features = ["no-bundler"] }' \
  'wasm-bindgen-rayon = "1.3"'
(cd "$accelerator" && CARGO_TARGET_DIR="$work/target" rustup run "$rust_toolchain" wasm-pack build \
  --target web \
  --release \
  --out-name gnark_kernel \
  --out-dir "$work/accelerator" \
  -- \
  --locked)
# The helper imports the kernel by its directory, which webpack refuses in an ES
# module; naming the file works in every bundler.
helpers=("$work"/accelerator/snippets/wasm-bindgen-rayon-*/src/workerHelpers.js)
if [[ ${#helpers[@]} != 1 || ! -f "${helpers[0]}" ]]; then
  echo "Expected one Rayon worker helper in the accelerator build" >&2
  exit 1
fi
replace "${helpers[0]}" "import('../../..')" "import('../../../gnark_kernel.js')"
for file in gnark_kernel.js gnark_kernel.d.ts gnark_kernel_bg.wasm; do
  install -m 644 "$work/accelerator/$file" "$staging/accelerator/$file"
done
cp -R "$work/accelerator/snippets" "$staging/accelerator/snippets"
install -m 644 "$accelerator/ark-bn254/LICENSE-APACHE" "$staging/accelerator/LICENSE-APACHE"
install -m 644 "$accelerator/ark-bn254/LICENSE-MIT" "$staging/accelerator/LICENSE-MIT"

output="$root/dist/runtime-v$version"
ZOLANA_REVISION="${ZOLANA_REVISION:-$(git -C "$root" rev-parse HEAD)}" \
MOPRO_REVISION="$mopro_revision" \
RUST_TOOLCHAIN="$rust_toolchain" \
WASM_PACK_VERSION="$(wasm-pack --version)" \
node "$root/scripts/package-runtime.mjs" "$version" "$staging" "$output"

echo "Runtime release assets: $output"
