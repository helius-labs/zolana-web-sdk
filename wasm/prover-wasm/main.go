//go:build js && wasm

// Command prover-wasm compiles Zolana's Groth16 proving path to js/wasm so a
// browser can produce protocol-real proofs locally instead of posting proof
// inputs to the prover server.
//
// The JSON accepted by `prove` is byte-identical to a POST /prove body and the
// JSON returned is the same common.Proof encoding, because this mirrors
// server.processProofSync's dispatch. A client can therefore swap the remote
// prover for this module without touching its codecs.
//
// Two deliberate departures from the server:
//
//   - common.LazyKeyManager resolves proving keys from a directory and fetches
//     missing ones over HTTPS. A browser has no such directory, so keys are
//     pushed in from JS via `loadKey` and held in an in-memory registry under
//     the same circuitType_nIn_nOut cache key the manager uses.
//   - groth16.Prove blocks for seconds. Go's js/wasm runtime shares the JS
//     thread, so the host MUST instantiate this inside a Web Worker or the page
//     will freeze for the duration of the proof.
//
// Mopro supplies the optional threaded Rust FFT/MSM kernel. Go retains
// Zolana witness construction, gnark solving, blinding and proof encoding.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/consensys/gnark/backend/groth16"
	cs "github.com/consensys/gnark/constraint/bn254"
	"runtime"
	"strings"
	"sync"
	"syscall/js"

	gnarklogger "github.com/consensys/gnark/logger"

	"zolana/prover/prover/common"
	mergeprover "zolana/prover/prover/merge"
	transfereddsaonly "zolana/prover/prover/transfer_eddsa_only"
)

// registry replaces common.LazyKeyManager. Keys are keyed exactly as
// LazyKeyManager keys its cache so a cache key computed from a proof request
// resolves the same system the server would have picked.
type registry struct {
	mu       sync.RWMutex
	systems  map[string]*common.TransferProofSystem
	prepared map[string]*preparedCircuit
}

func newRegistry() *registry {
	return &registry{systems: make(map[string]*common.TransferProofSystem), prepared: make(map[string]*preparedCircuit)}
}

func cacheKey(circuitType common.CircuitType, nInputs, nOutputs uint32) string {
	return fmt.Sprintf("%s_%d_%d", circuitType, nInputs, nOutputs)
}

func (r *registry) put(key string, ps *common.TransferProofSystem) {
	r.mu.Lock()
	defer r.mu.Unlock()
	// Keep a single shape resident; large transfer keys otherwise exhaust
	// browser memory during the shape sweep. The JS cache retains key bytes.
	for _, old := range r.prepared {
		if old.kernel != nil {
			old.kernel.close()
		}
	}
	clear(r.systems)
	clear(r.prepared)
	runtime.GC()
	c := &preparedCircuit{cs: ps.ConstraintSystem.(*cs.R1CS), pk: ps.ProvingKey, vk: ps.VerifyingKey, digest: ps.ProvingKeySha256}
	prepareKernel(c)
	r.systems[key] = ps
	r.prepared[key] = c
}

func (r *registry) get(key string) (*common.TransferProofSystem, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ps, ok := r.systems[key]
	return ps, ok
}

func (r *registry) keys() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.systems))
	for key := range r.systems {
		out = append(out, key)
	}
	return out
}

// circuitTypeForKeyFile mirrors common.ReadSystemFromFile, which derives the
// circuit type from the key's file name rather than from its header. Keeping the
// same derivation here means a key file downloaded from the same CloudFront
// prefix lands under the same circuit type it would on the server.
func circuitTypeForKeyFile(name string) (common.CircuitType, error) {
	lower := strings.ToLower(name)
	switch {
	case strings.Contains(lower, "transfer"):
		// Longer names first, "ring_authority" and "p256_ring" both contain "ring".
		if strings.Contains(lower, "ring_authority") {
			return common.TransferRingAuthorityCircuitType, nil
		}
		if strings.Contains(lower, "p256_ring") {
			return common.TransferP256RingCircuitType, nil
		}
		if strings.Contains(lower, "ring") {
			return common.TransferRingCircuitType, nil
		}
		return common.TransferConfidentialCircuitType, nil
	case strings.Contains(lower, "merge"):
		if strings.Contains(lower, "ring") {
			return common.MergeRingCircuitType, nil
		}
		return common.MergeCircuitType, nil
	default:
		return "", fmt.Errorf("unrecognized proving key file: %s", name)
	}
}

// loadKey deserializes one proving key pushed in from JS, either the pinned
// file or the raw form a previous exportRaw returned.
//
// Signature: loadKey(fileName: string, key: Uint8Array, sha256: string,
// exportRaw: boolean) -> { key, circuitType, nInputs, nOutputs, raw? } | { error }.
// sha256 is the pinned file's digest, which JS has checked the bytes (or the
// bytes the raw form was derived from) against.
func (r *registry) loadKey(args []js.Value) any {
	if len(args) != 4 {
		return errorResult(fmt.Errorf("loadKey expects (fileName, Uint8Array, sha256, exportRaw), got %d args", len(args)))
	}
	name := args[0].String()
	circuitType, err := circuitTypeForKeyFile(name)
	if err != nil {
		return errorResult(err)
	}
	digest, err := hex.DecodeString(args[2].String())
	if err != nil || len(digest) != sha256.Size {
		return errorResult(fmt.Errorf("loadKey expects a hex sha256 digest"))
	}

	raw := make([]byte, args[1].Get("byteLength").Int())
	if js.CopyBytesToGo(raw, args[1]) != len(raw) {
		return errorResult(fmt.Errorf("could not copy all %d key bytes out of the JS heap", len(raw)))
	}

	// A compressed container is rewritten with raw points on the kernel's
	// thread pool when the runtime has it: a wide key then loads in seconds
	// instead of tens, and the result is the raw form the host caches.
	var rawForm []byte
	if points := kernelDecompressor(); points != nil && compressedContainer(raw) {
		if transcoded, err := transcodeKey(raw, points); err == nil {
			rawForm = transcoded
		}
	}
	source := raw
	if rawForm != nil {
		source = rawForm
	}
	ps := new(common.TransferProofSystem)
	if _, err := ps.UnsafeReadFrom(bytes.NewReader(source)); err != nil {
		return errorResult(fmt.Errorf("deserializing %s: %w", name, err))
	}
	// Proofs report this digest so clients can match it to the proving key
	// pinned next to their verifying key, as common.ReadSystemFromFile does.
	ps.ProvingKeySha256 = [sha256.Size]byte(digest)
	ps.CircuitType = circuitType
	ps.Confidential = circuitType != common.TransferRingAuthorityCircuitType

	key := cacheKey(circuitType, ps.NInputs, ps.NOutputs)
	// The raw form first: preparing the kernel takes the points from the Go
	// copy of the key.
	if args[3].Bool() && rawForm == nil {
		if rawForm, err = rawKey(ps); err != nil {
			return errorResult(err)
		}
	}
	r.put(key, ps)

	// The constraint system's variable count is what groth16.Prove compares the
	// witness against, and a mismatch is reported as two bare totals. Surfacing it
	// at load time distinguishes a bad request from a key whose circuit does not
	// match this binary.
	result := map[string]any{
		"key":         key,
		"circuitType": string(circuitType),
		"nInputs":     int(ps.NInputs),
		"nOutputs":    int(ps.NOutputs),
		"nbPublic":    ps.ConstraintSystem.GetNbPublicVariables(),
		"nbSecret":    ps.ConstraintSystem.GetNbSecretVariables(),
		"constraints": ps.ConstraintSystem.GetNbConstraints(),
		"accelerated": r.prepared[key].kernel != nil,
		"fileName":    name,
	}
	if rawForm != nil {
		out := js.Global().Get("Uint8Array").New(len(rawForm))
		js.CopyBytesToJS(out, rawForm)
		result["raw"] = out
	}
	return result
}

// prove mirrors server.processProofSync for the circuits a wallet needs. The
// batch address-append circuit is intentionally absent: it is forester work, and
// its 3.5 GB key has no business in a browser.
//
// Signature: prove(requestJson: string) -> { proof } | { error }.
func (r *registry) prove(args []js.Value) any {
	if len(args) != 1 {
		return errorResult(fmt.Errorf("prove expects (requestJson), got %d args", len(args)))
	}
	request := []byte(args[0].String())

	meta, err := common.ParseProofRequestMeta(request)
	if err != nil {
		return errorResult(fmt.Errorf("malformed proof request: %w", err))
	}

	var proof *common.Proof
	switch meta.CircuitType {
	case common.TransferConfidentialCircuitType,
		common.TransferRingCircuitType,
		common.TransferRingAuthorityCircuitType:
		proof, err = r.proveTransfer(request)
	case common.MergeCircuitType, common.MergeRingCircuitType:
		proof, err = r.proveMerge(request, meta.CircuitType)
	default:
		err = fmt.Errorf("circuit type %s is not provable in the browser", meta.CircuitType)
	}
	if err != nil {
		return errorResult(err)
	}

	encoded, err := json.Marshal(proof)
	if err != nil {
		return errorResult(fmt.Errorf("encoding proof: %w", err))
	}
	return map[string]any{"proof": string(encoded)}
}

func (r *registry) proveTransfer(request []byte) (*common.Proof, error) {
	var params transfereddsaonly.TransferParameters
	if err := json.Unmarshal(request, &params); err != nil {
		return nil, fmt.Errorf("decoding transfer parameters: %w", err)
	}
	circuitType := params.Variant.CircuitType()
	key := cacheKey(circuitType, params.NInputs, params.NOutputs)
	ps, ok := r.get(key)
	if !ok {
		return nil, fmt.Errorf("proving key %s is not loaded; call loadKey first", key)
	}
	_ = ps
	return r.prepared[key].prove(&params)
}

func (r *registry) proveMerge(request []byte, circuitType common.CircuitType) (*common.Proof, error) {
	var params mergeprover.MergeParameters
	if err := json.Unmarshal(request, &params); err != nil {
		return nil, fmt.Errorf("decoding merge parameters: %w", err)
	}
	// Merge parameters carry no shape field; the input count selects the key.
	key := cacheKey(circuitType, uint32(len(params.Inputs)), mergeprover.MergeNOutputs)
	ps, ok := r.get(key)
	if !ok {
		return nil, fmt.Errorf("proving key %s is not loaded; call loadKey first", key)
	}
	_ = ps
	return r.prepared[key].prove(&params)
}

// Verify locally using gnark and the public witness derived from the request.
func (r *registry) verify(args []js.Value) any {
	if len(args) != 2 {
		return errorResult(fmt.Errorf("verify expects request and proof JSON"))
	}
	request := []byte(args[0].String())
	meta, err := common.ParseProofRequestMeta(request)
	if err != nil {
		return errorResult(err)
	}
	var params parameters
	var key string
	if meta.CircuitType == common.MergeCircuitType || meta.CircuitType == common.MergeRingCircuitType {
		p := new(mergeprover.MergeParameters)
		if err := json.Unmarshal(request, p); err != nil {
			return errorResult(err)
		}
		params = p
		key = cacheKey(meta.CircuitType, uint32(len(p.Inputs)), mergeprover.MergeNOutputs)
	} else {
		p := new(transfereddsaonly.TransferParameters)
		if err := json.Unmarshal(request, p); err != nil {
			return errorResult(err)
		}
		params = p
		key = cacheKey(p.Variant.CircuitType(), p.NInputs, p.NOutputs)
	}
	ps, ok := r.get(key)
	if !ok {
		return errorResult(fmt.Errorf("key %s is not loaded", key))
	}
	var proof common.Proof
	if err := json.Unmarshal([]byte(args[1].String()), &proof); err != nil {
		return errorResult(err)
	}
	w, err := assignmentWitness(params)
	if err != nil {
		return errorResult(err)
	}
	public, err := w.Public()
	if err != nil {
		return errorResult(err)
	}
	return map[string]any{"valid": groth16.Verify(proof.Proof, ps.VerifyingKey, public) == nil}
}

func byteArray(value js.Value) []byte {
	data := make([]byte, value.Get("byteLength").Int())
	js.CopyBytesToGo(data, value)
	return data
}

// guard converts a Go panic inside a proof into an error result. gnark panics on
// some malformed witnesses, and one bad request must not kill the instance.
func guard(fn func([]js.Value) any) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) (result any) {
		defer func() {
			if recovered := recover(); recovered != nil {
				result = errorResult(nil)
			}
		}()
		return fn(args)
	})
}

// asyncGuard is guard for a call that may wait on the kernel's GPU: fn runs
// in a goroutine and the caller gets a Promise of its result.
func asyncGuard(fn func([]js.Value) any) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		held := append([]js.Value(nil), args...)
		executor := js.FuncOf(func(_ js.Value, settle []js.Value) any {
			resolve := settle[0]
			go func() {
				result := func() (result any) {
					defer func() {
						if recovered := recover(); recovered != nil {
							result = errorResult(nil)
						}
					}()
					asyncProving = true
					defer func() { asyncProving = false }()
					return fn(held)
				}()
				resolve.Invoke(result)
			}()
			return nil
		})
		defer executor.Release()
		return js.Global().Get("Promise").New(executor)
	})
}

func main() {
	// gnark logs progress to stderr during Prove. Under js/wasm a write is an
	// async JS operation, and `prove` is invoked synchronously from a JS callback,
	// so the event loop cannot run the write's completion callback while Go is on
	// the stack. The Go runtime then sees every goroutine blocked and aborts with
	// "all goroutines are asleep - deadlock!", killing the instance mid-proof.
	// Silencing the logger removes the only async syscall on the proving path.
	gnarklogger.Disable()

	keys := newRegistry()

	api := js.Global().Get("Object").New()
	api.Set("loadKey", guard(keys.loadKey))
	api.Set("prove", guard(keys.prove))
	api.Set("proveAsync", asyncGuard(keys.prove))
	api.Set("verify", guard(keys.verify))
	api.Set("rawKeyFormat", rawKeyFormat)
	api.Set("loadedKeys", guard(func([]js.Value) any {
		loaded := keys.keys()
		out := make([]any, len(loaded))
		for i, key := range loaded {
			out[i] = key
		}
		return map[string]any{"keys": out}
	}))
	js.Global().Set("__zolanaProver", api)

	// Signal readiness after the API is installed so the worker never races a
	// prove call against instantiation.
	if ready := js.Global().Get("__zolanaProverReady"); ready.Type() == js.TypeFunction {
		ready.Invoke()
	}

	// Go's js/wasm exits the instance when main returns, which would revoke every
	// installed callback. Block forever instead.
	<-make(chan struct{})
}
