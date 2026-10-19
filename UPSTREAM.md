# Upstream

`upstream.lock.json` pins the published `@heliuslabs/zolana` release the examples depend on and the `helius-labs/zolana` tag it was cut from. The prover's keys are zopro keys built from the gnark proving keys that release pins (`prover/server/prover/provingkeys/proving-keys.lock` at the tag), so the runtime proves that SDK's `/prove` requests and its proofs report the gnark key's sha256 the SDK expects. A new SDK release re-pins both together and rebuilds the keys. `scripts/check-upstream.sh` (CI job `upstream`) fails when anything below drifts from that pin:

- every confidential transfer and merge key upstream pins has a zopro key in `zopro-keys.lock`, built from the gnark key upstream pins (`key_sha256`), in the same key set and CDN folder;
- `shapes.ts` lists exactly the locked keys;
- the browser example depends on the pinned SDK, and the installed SDK's `PROVING_KEY_SHA256S` match the gnark keys the zopro keys were built from.

To rebuild the keys after a rotation, run zopro's `tools/gnark/build-keys.sh` with upstream's gnark lockfile, publish the `.zopro` files in the key set's CDN folder, copy the `zopro-keys.lock` it writes here and run `npm run generate:keys --workspace @heliuslabs/zolana-web-prover`.

The runtime is zopro-zolana at the revision `runtime.lock.json` pins (`scripts/build-runtime.sh`).

Source mapping:

- `poc/core` -> `packages/web-prover` (from branch `feat/mopro-browser-arkworks` at `87e9463b0d5b9527282ff7d77687258c92bb696e`)
- `poc/web` -> `examples/browser` (same branch and commit)

`fixtures/` holds valid requests for each benchmarked shape on trees of their own; the mobile SDK's `tools/prove-fixtures` wrote them.
