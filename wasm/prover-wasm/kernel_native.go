//go:build !js || !wasm

package main

// Native builds keep gnark's own parallel prover and assembly kernels.
func prepareKernel(c *preparedCircuit) {}

// Native builds decompress with gnark itself, in parallel already.
func kernelDecompressor() decompressor { return nil }
