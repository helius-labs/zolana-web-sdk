package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	mergeprover "zolana/prover/prover/merge"
	transfer "zolana/prover/prover/transfer_eddsa_only"
)

// Every testdata transfer request parses and has the shape its name says:
// the proof timing harness proves them in the browser.
func TestTransferFixturesHaveTheirShapes(t *testing.T) {
	matches, err := filepath.Glob("testdata/transfer-*.json")
	if err != nil || len(matches) < 4 {
		t.Fatalf("transfer fixtures: %v (%d found)", err, len(matches))
	}
	for _, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var params transfer.TransferParameters
		if err := json.Unmarshal(data, &params); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if err := params.ValidateShape(); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		shape := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(path), "transfer-"), ".json")
		var inputs, outputs uint32
		if _, err := fmt.Sscanf(shape, "%dx%d", &inputs, &outputs); err != nil || inputs != params.NInputs || outputs != params.NOutputs {
			t.Fatalf("%s: shape %dx%d", path, params.NInputs, params.NOutputs)
		}
	}
}

// Every testdata merge request parses with as many inputs as its name says.
func TestMergeFixturesHaveTheirShapes(t *testing.T) {
	matches, err := filepath.Glob("testdata/merge-*.json")
	if err != nil || len(matches) == 0 {
		t.Fatalf("merge fixtures: %v (%d found)", err, len(matches))
	}
	for _, path := range matches {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var params mergeprover.MergeParameters
		if err := json.Unmarshal(data, &params); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		var inputs int
		if _, err := fmt.Sscanf(strings.TrimPrefix(filepath.Base(path), "merge-"), "%dx1", &inputs); err != nil || inputs != len(params.Inputs) {
			t.Fatalf("%s: %d inputs", path, len(params.Inputs))
		}
	}
}
