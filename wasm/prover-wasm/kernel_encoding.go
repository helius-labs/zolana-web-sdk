package main

import (
	"unsafe"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
)

// The arithmetic bridge uses four little-endian Montgomery limbs per element:
// the memory of an fr.Element on a little-endian target, as of every type
// packKernel sends.
func encodeKernelFields(values []fr.Element) []byte {
	return bytesOf(values)
}

// The memory of a slice of plain values, to send as it is.
func bytesOf[T any](values []T) []byte {
	if len(values) == 0 {
		return nil
	}
	var element T
	return unsafe.Slice((*byte)(unsafe.Pointer(&values[0])), int(unsafe.Sizeof(element))*len(values))
}
