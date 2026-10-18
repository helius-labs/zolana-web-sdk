package main

import (
	"fmt"
	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	native "github.com/consensys/gnark/backend/groth16/bn254"
	"github.com/consensys/gnark/backend/witness"
	cs "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"zolana/prover/prover/common"
)

// Adapt Mopro's prepared arithmetic bridge to Zolana's bundled proving system.
// The circuit, keys, witness assignment and proof JSON remain Zolana's formats.
type preparedCircuit struct {
	cs     *cs.R1CS
	pk     groth16.ProvingKey
	vk     groth16.VerifyingKey
	digest [32]byte
	kernel proofKernel
}

type parameters interface {
	ValidateShape() error
	CreateWitness() (frontend.Circuit, error)
}

func assignmentWitness(params parameters) (witness.Witness, error) {
	if err := params.ValidateShape(); err != nil {
		return nil, err
	}
	assignment, err := params.CreateWitness()
	if err != nil {
		return nil, fmt.Errorf("create assignment: %w", err)
	}
	return frontend.NewWitness(assignment, ecc.BN254.ScalarField())
}

func (c *preparedCircuit) prove(params parameters) (*common.Proof, error) {
	w, err := assignmentWitness(params)
	if err != nil {
		return nil, err
	}
	var proof groth16.Proof
	if c.kernel == nil {
		proof, err = groth16.Prove(c.cs, c.pk, w)
	} else {
		proof, err = proveAccelerated(c.cs, c.pk.(*native.ProvingKey), c.kernel, w)
		// A proof from the page's GPU is checked before it leaves: a GPU
		// can miscompute (phones' did). A failed one, or a failed GPU, costs
		// the key its GPU and the proof is made again on the CPU.
		if kernel, ok := c.kernel.(gpuKernel); ok && kernel.provesOnGPU() && c.vk != nil {
			if err == nil {
				err = verifyProof(proof, c.vk, w)
			}
			if err != nil {
				kernel.dropGPU()
				proof, err = proveAccelerated(c.cs, c.pk.(*native.ProvingKey), c.kernel, w)
			}
		}
	}
	if err != nil {
		return nil, err
	}
	return &common.Proof{Proof: proof, ProvingKeySha256: c.digest}, nil
}

// gpuKernel is a kernel that may prove on the page's GPU (the browser's).
type gpuKernel interface {
	// provesOnGPU: the next proof would come from the GPU.
	provesOnGPU() bool
	// dropGPU makes the kernel prove on the CPU from now on.
	dropGPU()
}

func verifyProof(proof groth16.Proof, vk groth16.VerifyingKey, full witness.Witness) error {
	public, err := full.Public()
	if err != nil {
		return err
	}
	return groth16.Verify(proof, vk, public)
}
