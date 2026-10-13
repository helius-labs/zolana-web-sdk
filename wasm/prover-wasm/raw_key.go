package main

import (
	"bytes"
	"encoding/binary"
	"fmt"

	"zolana/prover/prover/common"
)

// rawKeyFormat names the encoding rawKey writes. The host stores it with each
// cached raw key and discards entries written by a bridge built against other
// gnark versions; a test keeps it in step with go.mod.
const rawKeyFormat = "raw-1 gnark v0.16.3 gnark-crypto v0.21.0"

// rawKey re-encodes a loaded proving system in the key file layout with
// uncompressed points. The pinned key files store compressed points, and
// decompressing them under js/wasm takes about 4 s for a 2x2 key; the raw
// form of the same key decodes in tens of milliseconds, so the host caches it
// after a shape's first load. TransferProofSystem.UnsafeReadFrom reads both.
func rawKey(ps *common.TransferProofSystem) ([]byte, error) {
	var out bytes.Buffer
	requiresP256 := uint32(0)
	if ps.RequiresP256 {
		requiresP256 = 1
	}
	for _, field := range []uint32{ps.NInputs, ps.NOutputs, requiresP256} {
		if err := binary.Write(&out, binary.BigEndian, field); err != nil {
			return nil, err
		}
	}
	if _, err := ps.ProvingKey.WriteRawTo(&out); err != nil {
		return nil, fmt.Errorf("encoding proving key: %w", err)
	}
	if _, err := ps.VerifyingKey.WriteRawTo(&out); err != nil {
		return nil, fmt.Errorf("encoding verifying key: %w", err)
	}
	if _, err := ps.ConstraintSystem.WriteTo(&out); err != nil {
		return nil, fmt.Errorf("encoding constraint system: %w", err)
	}
	return out.Bytes(), nil
}
