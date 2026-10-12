#!/usr/bin/env bash
# Fails when wasm, the vendored test vectors, the key pins or the example's SDK
# pin drift from the zolana release pinned in upstream.lock.json. Set
# ZOLANA_SRC to an existing checkout to skip the clone.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lock="$root/upstream.lock.json"
wasm="$root/wasm"

json() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$@"; }
repository="$(json "$lock" repository)"
tag="$(json "$lock" tag)"
revision="$(json "$lock" revision)"
sdk="$(json "$lock" sdk)"
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "upstream.lock.json revision must be a full commit" >&2; exit 1; }

failed=0
fail() { echo "drift: $*" >&2; failed=1; }
sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{ print $1 }'; else sha256sum | awk '{ print $1 }'; fi; }

# The tag must still name the pinned commit: a moved tag means a re-cut release.
tagged="$(git ls-remote --tags "$repository" "refs/tags/$tag^{}" "refs/tags/$tag" | awk '{ print $1 }' | head -1)"
[[ "$tagged" == "$revision" ]] || fail "tag $tag is at ${tagged:-<missing>}, upstream.lock.json pins $revision"

source_dir="${ZOLANA_SRC:-}"
if [[ -z "$source_dir" ]]; then
  source_dir="$(mktemp -d "${TMPDIR:-/tmp}/zolana-upstream.XXXXXX")"
  trap 'rm -rf "$source_dir"' EXIT
  git -C "$source_dir" init -q
  git -C "$source_dir" remote add origin "$repository"
  git -C "$source_dir" fetch -q --depth=1 --filter=blob:none origin "$revision"
fi
upstream() { git -C "$source_dir" show "$revision:$1"; }
upstream_ls() { git -C "$source_dir" ls-tree --name-only "$revision" "$1/" 2>/dev/null | sed "s|^$1/||"; }

# Files that carry a documented local edit: compare after undoing it.
normalize() {
  case "$1" in
    prover/common/marshal.go) sed 's|fmt.Errorf("invalid number")|fmt.Errorf("invalid number: %s", s)|' ;;
    circuits/spp_transaction/shared/hash_chain_4_test.go | circuits/spp_transaction/shared/right_hash_chain_4_test.go)
      sed 's|"../../../test-vectors/|"../../../../../test-vectors/|' ;;
    circuits/gadget/nonzero_hash_chain_vectors_test.go | prover/common/input_flags_test.go)
      sed 's|"../../test-vectors/|"../../../../test-vectors/|' ;;
    prover/transcript/transcript_test.go) sed 's|"../../test-vectors/indexed-proof.json"|"../../../../sdk-libs/fixtures/indexed-proof.json"|' ;;
    *) cat ;;
  esac
}
# Files that exist only here.
local_only() {
  case "$1" in
    prover-wasm/* | test-vectors/* | circuits/spp_transaction/shared/web_fixture_test.go | prover/common/marshal_local_test.go) return 0 ;;
  esac
  return 1
}
# Upstream files the closure leaves out: GPU-only builds and their docs, and
# every test of the prover-test helper packages.
upstream_excluded() {
  case "$1" in
    prover/backend/README.md | prover/backend/aeglos-source.lock) return 0 ;;
    prover-test/*_test.go) return 0 ;;
  esac
  if [[ "$1" == *.go ]] && upstream "prover/server/$1" | grep -q '^//go:build.*aeglos' && ! upstream "prover/server/$1" | grep -q '^//go:build !aeglos'; then
    return 0
  fi
  return 1
}

# Every vendored file matches upstream, and every upstream file of a vendored
# Go package (a directory holding .go files) is here.
while read -r path; do
  local_only "$path" && continue
  if ! upstream "prover/server/$path" >/tmp/check-upstream.$$ 2>/dev/null; then
    fail "wasm/$path has no upstream prover/server/$path at $revision"
    continue
  fi
  [[ "$(normalize "$path" < "$wasm/$path" | sha256)" == "$(sha256 < /tmp/check-upstream.$$)" ]] ||
    fail "wasm/$path differs from prover/server/$path at $revision"
done < <(cd "$wasm" && find . -type f | sed 's|^\./||' | sort)
rm -f /tmp/check-upstream.$$
while read -r dir; do
  while read -r name; do
    [[ -n "$name" ]] || continue
    path="${dir:+$dir/}$name"
    [[ -f "$wasm/$path" ]] && continue
    upstream_excluded "$path" && continue
    fail "upstream prover/server/$path is not vendored"
  done < <(upstream_ls "prover/server${dir:+/$dir}" | while read -r entry; do
    [[ -z "$entry" ]] && continue
    git -C "$source_dir" cat-file -e "$revision:prover/server${dir:+/$dir}/$entry" 2>/dev/null || continue
    [[ "$(git -C "$source_dir" cat-file -t "$revision:prover/server${dir:+/$dir}/$entry")" == blob ]] && echo "$entry"
  done)
done < <(cd "$wasm" && find . -name '*.go' -not -path './prover-wasm/*' | xargs -n1 dirname | sed 's|^\./||' | sort -u)

# Vendored vectors are upstream's.
for file in "$wasm"/test-vectors/*; do
  name="$(basename "$file")"
  case "$name" in
    indexed-proof.json) source="sdk-libs/fixtures/$name" ;;
    *) source="test-vectors/$name" ;;
  esac
  [[ "$(sha256 < "$file")" == "$(upstream "$source" | sha256)" ]] || fail "wasm/test-vectors/$name differs from $source at $revision"
done

# Same Go toolchain and gnark as the server that generated the keys.
for module in go github.com/consensys/gnark github.com/consensys/gnark-crypto; do
  want="$(upstream prover/server/go.mod | awk -v m="$module" '$1 == m { print $2; exit }')"
  got="$(awk -v m="$module" '$1 == m { print $2; exit }' "$wasm/go.mod")"
  [[ "$got" == "$want" ]] || fail "wasm/go.mod pins $module $got, upstream uses $want"
done

# The key lock the bridge embeds is also what setup downloads and shapes.ts sizes.
keys="$wasm/prover/provingkeys/proving-keys.lock"
python3 - "$keys" "$root/runtime.lock.json" "$root/packages/web-prover/src/shapes.ts" "$(upstream prover/server/prover/common/key_downloader.go | grep -o 'defaultProvingKeysBaseURL = "[^"]*"' | cut -d'"' -f2)" <<'PY' || failed=1
import json, re, sys
lock, runtime, shapes, base = sys.argv[1:]
keys = json.load(open(lock))["keys"]
prefix = json.load(open(lock))["prefix"]
rt = json.load(open(runtime))
want = f"{base}/{prefix}/"
ok = True
def fail(m):
    global ok; ok = False; print("drift:", m, file=sys.stderr)
if rt["provingKeysBaseUrl"] != want: fail(f"runtime.lock.json provingKeysBaseUrl is {rt['provingKeysBaseUrl']}, lock prefix wants {want}")
for k in rt["requiredKeys"]:
    if k not in keys: fail(f"runtime.lock.json requires {k}, absent from proving-keys.lock")
src = open(shapes).read()
listed = {}
for i, o, n in re.findall(r"\bentry\((\d+), (\d+), ([\d_]+)\)", src): listed[f"transfer_confidential_{i}_{o}.key"] = int(n.replace("_", ""))
for i, n in re.findall(r"\bmergeEntry\((\d+), ([\d_]+)\)", src): listed[f"merge_{i}_1.key"] = int(n.replace("_", ""))
for k, n in listed.items():
    if k not in keys: fail(f"shapes.ts lists {k}, absent from proving-keys.lock")
    elif keys[k]["size"] != n: fail(f"shapes.ts sizes {k} at {n}, lock says {keys[k]['size']}")
for k in keys:
    if re.fullmatch(r"transfer_confidential_\d+_\d+\.key|merge_\d+_1\.key", k) and k not in listed: fail(f"proving-keys.lock has {k}, missing from shapes.ts")
sys.exit(0 if ok else 1)
PY

# The example's SDK is the pinned release, and it verifies against our keys.
pinned="$(json "$root/examples/browser/package.json" dependencies | python3 -c 'import ast, sys; print(ast.literal_eval(sys.stdin.read())["@heliuslabs/zolana"])')"
[[ "$pinned" == "$sdk" ]] || fail "examples/browser pins @heliuslabs/zolana $pinned, upstream.lock.json says $sdk"
installed="$root/node_modules/@heliuslabs/zolana"
if [[ -d "$installed" ]]; then
  got="$(json "$installed/package.json" version)"
  [[ "$got" == "$sdk" ]] || fail "installed @heliuslabs/zolana is $got, upstream.lock.json says $sdk"
  node --input-type=module - "$installed/dist/interface/proving-keys.js" "$keys" <<'JS' || failed=1
import { readFileSync } from "node:fs";
const [file, lock] = process.argv.slice(2);
const sdk = (await import(file)).PROVING_KEY_SHA256S;
const keys = JSON.parse(readFileSync(lock, "utf8")).keys;
let ok = true;
for (const [name, sha256] of Object.entries(sdk)) {
  if (!(name in keys)) { console.error(`drift: the SDK pins ${name}, absent from proving-keys.lock`); ok = false; }
  else if (keys[name].sha256 !== sha256) { console.error(`drift: the SDK pins ${name} at ${sha256}, lock has ${keys[name].sha256}`); ok = false; }
}
process.exit(ok ? 0 : 1);
JS
else
  echo "note: node_modules absent, skipping the installed SDK check (run npm ci)" >&2
fi

if [[ "$failed" -ne 0 ]]; then
  echo "wasm, vectors or pins are out of sync with zolana $tag ($revision)" >&2
  exit 1
fi
echo "wasm, vectors and pins match zolana $tag ($revision) and @heliuslabs/zolana $sdk"
