#!/usr/bin/env bash
# Builds the browser arithmetic kernel from a ringil checkout instead of the
# pinned Mopro template, into the layout `npm run setup` installs under
# examples/browser/public/prover/accelerator, and installs it there. The
# Go bridge is unchanged: ringil-core is the kernel crate, with key images.
#
#   scripts/build-runtime-ringil.sh <ringil checkout>
#
# The crate builds as a cdylib alone: its SIMD assembly assembles with
# simd128 only in the crate that links, not through an rlib under LTO.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ringil="$(cd "${1:?ringil checkout}" && pwd)"
rust_toolchain="nightly-2025-11-15"
bindgen_version="0.2.128"
target="${CARGO_TARGET_DIR:-$ringil/target/wasm}"
out="$root/examples/browser/public/prover/accelerator"

(cd "$ringil/crates/ringil-core" && CARGO_TARGET_DIR="$target" rustup run "$rust_toolchain" \
  cargo rustc --release --target wasm32-unknown-unknown --crate-type cdylib)
bindgen="$(command -v wasm-bindgen || true)"
if [[ -z "$bindgen" || "$("$bindgen" --version)" != "wasm-bindgen $bindgen_version" ]]; then
  bindgen="$HOME/Library/Caches/.wasm-pack/wasm-bindgen-cargo-install-$bindgen_version/wasm-bindgen"
fi
if [[ ! -x "$bindgen" ]]; then
  echo "wasm-bindgen $bindgen_version is required (cargo install wasm-bindgen-cli --version $bindgen_version)" >&2
  exit 1
fi
staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
"$bindgen" --target web --out-name gnark_kernel --out-dir "$staging" \
  "$target/wasm32-unknown-unknown/release/ringil_core.wasm"
mkdir -p "$out"
rm -rf "$out/snippets"
install -m 644 "$staging/gnark_kernel.js" "$out/gnark_kernel.js"
install -m 644 "$staging/gnark_kernel_bg.wasm" "$out/gnark_kernel_bg.wasm"
cp -R "$staging/snippets" "$out/snippets"
echo "kernel $(shasum -a 256 "$out/gnark_kernel_bg.wasm" | cut -c1-12) from ringil $(git -C "$ringil" rev-parse --short HEAD) installed in $out"
