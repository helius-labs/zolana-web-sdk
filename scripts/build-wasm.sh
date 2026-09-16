#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
module="$root/wasm"
public="$root/examples/browser/public/prover"
vendor="$root/packages/web-prover/src/vendor"
bridge="$root/dist/bridge"
export GOTOOLCHAIN=go1.25.7
mkdir -p "$public" "$vendor" "$bridge"

goroot="$(cd "$module" && go env GOROOT)"
shim=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [[ -f "$candidate" ]]; then shim="$candidate"; break; fi
done
if [[ -z "$shim" ]]; then
  echo "wasm_exec.js not found under $goroot" >&2
  exit 1
fi

(cd "$module" && GOOS=js GOARCH=wasm CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-s -w" -o "$bridge/zolana-prover.wasm" ./prover-wasm)
install -m 644 "$bridge/zolana-prover.wasm" "$public/zolana-prover.wasm"
install -m 644 "$shim" "$bridge/wasm_exec.js"
install -m 644 "$shim" "$vendor/wasm_exec.js"
node "$root/scripts/package-bridge.mjs"
echo "staged Go prover and matching runtime shim"
