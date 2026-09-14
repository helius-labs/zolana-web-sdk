#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
module="$root/wasm"
public="$root/examples/browser/public/prover"
vendor="$root/packages/web-prover/src/vendor"
mkdir -p "$public" "$vendor"

goroot="$(cd "$module" && go env GOROOT)"
shim=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [[ -f "$candidate" ]]; then shim="$candidate"; break; fi
done
if [[ -z "$shim" ]]; then
  echo "wasm_exec.js not found under $goroot" >&2
  exit 1
fi

(cd "$module" && GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o "$public/zolana-prover.wasm" ./prover-wasm)
install -m 644 "$shim" "$vendor/wasm_exec.js"
echo "staged Go prover and matching runtime shim"
