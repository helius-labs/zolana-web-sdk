package main

import (
	"bytes"
	"os"
	"testing"

	"zolana/prover/prover/common"
)

// The transcoded container decodes to the same proving system as the
// compressed one, and re-encodes to the same raw form: what the kernel path
// loads is what the raw-key cache would have held.
func TestTranscodedKeyIsTheRawKey(t *testing.T) {
	container, err := os.ReadFile("../../examples/browser/public/keys/transfer_confidential_2_2.key")
	if os.IsNotExist(err) {
		t.Skip("stage the local demo key first")
	}
	if err != nil {
		t.Fatal(err)
	}
	if !compressedContainer(container) {
		t.Fatal("the pinned key stores compressed points")
	}
	transcoded, err := transcodeKey(container, goDecompressor{})
	if err != nil {
		t.Fatal(err)
	}
	if compressedContainer(transcoded) {
		t.Fatal("the transcoded key still starts with a compressed point")
	}
	var fromCompressed, fromTranscoded common.TransferProofSystem
	if _, err := fromCompressed.UnsafeReadFrom(bytes.NewReader(container)); err != nil {
		t.Fatal(err)
	}
	if _, err := fromTranscoded.UnsafeReadFrom(bytes.NewReader(transcoded)); err != nil {
		t.Fatal("decoding the transcoded key:", err)
	}
	expected, err := rawKey(&fromCompressed)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(transcoded, expected) {
		t.Fatal("the transcoded key differs from gnark's raw re-encoding")
	}
	if _, err := transcodeKey(transcoded, goDecompressor{}); err == nil {
		t.Fatal("a raw container transcoded again")
	}
	if _, err := transcodeKey(container[:len(container)/2], goDecompressor{}); err == nil {
		t.Fatal("a cut container transcoded")
	}
}
