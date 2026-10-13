package main

import (
	"bytes"
	"os"
	"regexp"
	"testing"

	"zolana/prover/prover/common"
)

func TestRawKeyRoundTripsThePinnedKey(t *testing.T) {
	pinned, err := os.ReadFile("../../examples/browser/public/keys/transfer_confidential_2_2.key")
	if os.IsNotExist(err) {
		t.Skip("stage the local demo key first")
	}
	if err != nil {
		t.Fatal(err)
	}
	var ps common.TransferProofSystem
	if _, err := ps.UnsafeReadFrom(bytes.NewReader(pinned)); err != nil {
		t.Fatal(err)
	}
	raw, err := rawKey(&ps)
	if err != nil {
		t.Fatal(err)
	}
	if len(raw) <= len(pinned) {
		t.Fatalf("raw key is %d bytes, pinned key %d; expected uncompressed points", len(raw), len(pinned))
	}

	var decoded common.TransferProofSystem
	read, err := decoded.UnsafeReadFrom(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if read != int64(len(raw)) {
		t.Fatalf("read %d of %d raw bytes", read, len(raw))
	}
	// Re-encoding what was read from the raw form must reproduce the pinned
	// file byte for byte: same shape header, keys and constraint system.
	var reencoded bytes.Buffer
	if _, err := decoded.WriteTo(&reencoded); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reencoded.Bytes(), pinned) {
		t.Fatal("the raw key does not decode to the pinned key")
	}
}

func TestRawKeyFormatNamesTheBuiltGnark(t *testing.T) {
	mod, err := os.ReadFile("../go.mod")
	if err != nil {
		t.Fatal(err)
	}
	for _, module := range []string{"github.com/consensys/gnark", "github.com/consensys/gnark-crypto"} {
		version := regexp.MustCompile(`(?m)^\s*` + regexp.QuoteMeta(module) + ` (v\S+)`).FindSubmatch(mod)
		if version == nil {
			t.Fatalf("%s is not required by go.mod", module)
		}
		name := module[len("github.com/consensys/"):] + " " + string(version[1])
		if !bytes.Contains([]byte(rawKeyFormat), []byte(name)) {
			t.Fatalf("rawKeyFormat %q does not name %s; bump it with the dependency", rawKeyFormat, name)
		}
	}
}
