#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-}"
mopro="${2:-}"
mopro_revision="2bb184c23463d6415ebb5c9110bfd779df910d2f"
rust_toolchain="nightly-2025-11-15"
go_toolchain="go1.27.1"

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
mkdir -p \
  "$staging/examples/browser/public/prover/accelerator" \
  "$staging/packages/web-prover/src/vendor"

echo "Building the Zolana Go prover..."
(cd "$root/wasm" && GOTOOLCHAIN="$go_toolchain" GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w" \
  -o "$staging/examples/browser/public/prover/zolana-prover.wasm" ./prover-wasm)
goroot="$(cd "$root/wasm" && GOTOOLCHAIN="$go_toolchain" go env GOROOT)"
install -m 644 "$goroot/lib/wasm/wasm_exec.js" "$staging/packages/web-prover/src/vendor/wasm_exec.js"

echo "Building the pinned Mopro accelerator..."
rustup component add rust-src --toolchain "$rust_toolchain"
(cd "$mopro/cli" && rustc --edition=2021 build.rs -o "$work/stage-templates")
(cd "$mopro/cli" && OUT_DIR="$work/templates" "$work/stage-templates")
accelerator="$work/templates/init-template/gnark-web/accelerator"
(cd "$accelerator" && CARGO_TARGET_DIR="$work/target" rustup run "$rust_toolchain" wasm-pack build \
  --target web \
  --release \
  --out-name gnark_kernel \
  --out-dir "$work/accelerator" \
  -- \
  --locked)
install -m 644 "$work/accelerator/gnark_kernel.js" "$staging/examples/browser/public/prover/accelerator/gnark_kernel.js"
install -m 644 "$work/accelerator/gnark_kernel_bg.wasm" "$staging/examples/browser/public/prover/accelerator/gnark_kernel_bg.wasm"
cp -R "$work/accelerator/snippets" "$staging/examples/browser/public/prover/accelerator/snippets"
install -m 644 "$accelerator/ark-bn254/LICENSE-APACHE" "$staging/examples/browser/public/prover/accelerator/LICENSE-APACHE"
install -m 644 "$accelerator/ark-bn254/LICENSE-MIT" "$staging/examples/browser/public/prover/accelerator/LICENSE-MIT"

output="$root/dist/runtime-v$version"
ZOLANA_REVISION="${ZOLANA_REVISION:-$(git -C "$root" rev-parse HEAD)}" \
MOPRO_REVISION="$mopro_revision" \
GO_VERSION="$(cd "$root/wasm" && GOTOOLCHAIN="$go_toolchain" go version)" \
RUST_TOOLCHAIN="$rust_toolchain" \
WASM_PACK_VERSION="$(wasm-pack --version)" \
node "$root/scripts/package-runtime.mjs" "$version" "$staging" "$output"

echo "Runtime release assets: $output"
