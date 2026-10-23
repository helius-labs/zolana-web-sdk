# Upstream

`upstream.lock.json` pins the `helius-labs/zolana` release the prover follows, v0.5.0-alpha, and the `@heliuslabs/zolana` version cut from it. devnet-d runs that release: shielded pool `spp3CfN2Y7se74A27bBpnAkmjXyEb2YmmZafhFrC9xt`, user registry `regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ`. The prover's keys are zopro keys built from the gnark proving keys that release pins (`prover/server/prover/provingkeys/proving-keys.lock` at the tag, key set `8e234b5a589cfb79`, merges of 8, 24 and 52 notes), so the runtime proves that SDK's `/prove` requests and its proofs report the gnark key's sha256 the SDK expects. A new SDK release re-pins both together and rebuilds the keys. `scripts/check-upstream.sh` (CI job `upstream`) fails when anything below drifts from that pin:

- every confidential transfer and merge key upstream pins has a zopro key in `zopro-keys.lock`, built from the gnark key upstream pins (`key_sha256`), in the same key set and CDN folder;
- the wallet example depends on the pinned SDK, and the installed SDK's `PROVING_KEY_SHA256S` match the gnark keys the zopro keys were built from.

The wallet example installs the SDK from npm, so its pin may lag the protocol pin until that version is published there: the check then notes the lag and skips the installed SDK, and fails once the version is on npm. `@heliuslabs/zolana` 0.5.0-alpha is not on npm yet, so the example stays on 0.4.0-alpha.

To rebuild the keys after a rotation, run zopro's `tools/gnark/build-keys.sh` with upstream's gnark lockfile, publish the `.zopro` files in the key set's CDN folder and copy the `zopro-keys.lock` it writes here; the package's build and tests generate the key digests and shapes from it.

The runtime is zopro-zolana at the revision `runtime.lock.json` pins (`scripts/build-runtime.sh`).

Source mapping:

- `poc/core` -> `packages/web-prover` (from branch `feat/mopro-browser-arkworks` at `87e9463b0d5b9527282ff7d77687258c92bb696e`)
- `poc/web` -> `examples/browser` (same branch and commit)

`fixtures/` holds valid requests for each benchmarked shape on trees of their own, from zk-tools' `zopro/tools/zolana/fixtures` at the runtime's revision: zolana's request and merge fixtures with the shape changed.
