#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
module="$root/wasm"
# The package ships the Go bridge beside its worker, and the shim inside it.
runtime="$root/packages/web-prover/src/runtime"
vendor="$root/packages/web-prover/src/vendor"
fixtures="$root/examples/browser/public/fixtures"
export GOTOOLCHAIN=go1.27.1
mkdir -p "$runtime" "$vendor" "$fixtures"

goroot="$(cd "$module" && go env GOROOT)"
shim=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [[ -f "$candidate" ]]; then shim="$candidate"; break; fi
done
if [[ -z "$shim" ]]; then
  echo "wasm_exec.js not found under $goroot" >&2
  exit 1
fi

(cd "$module" && GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w" -o "$runtime/zolana-prover.wasm" ./prover-wasm)
install -m 644 "$shim" "$vendor/wasm_exec.js"
# Every shape's request, for the example page and the proof timing harness.
install -m 644 "$module"/prover-wasm/testdata/transfer-*.json "$fixtures/"
echo "staged Go prover, matching runtime shim and request fixtures"
