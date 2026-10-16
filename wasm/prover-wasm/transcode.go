package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"

	"github.com/consensys/gnark-crypto/ecc"
	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark/backend/groth16"
)

// A decompressor turns gnark's compressed points into its raw encoding: G1
// points of 32 bytes into 64, G2 points of 64 into 128. The browser kernel
// does it on its thread pool; see kernel_js.go.
type decompressor interface {
	g1(compressed []byte) ([]byte, error)
	g2(compressed []byte) ([]byte, error)
}

var errTranscode = errors.New("key container not in the pinned layout")

const (
	keyHeaderBytes = 12
	// What fft.Domain.WriteTo writes.
	domainBytes = 8 + 5*32 + 1
	// The flag bits of a point's first byte: 00 raw, 10 and 11 compressed,
	// 01 the point at infinity.
	pointMask = 0b11 << 6
)

// transcodeKey rewrites the proving key section of a `.key` container with
// raw points, decompressed by `points`, and returns the container as rawKey
// writes it: header, raw proving key, raw verifying key, constraint system.
// gnark's UnsafeReadFrom then decodes it in a fraction of the time the
// compressed file takes. The layout is gnark v0.16.3's; a container that
// does not fit it, or a point already raw, fails, and the caller reads the
// compressed container as before.
func transcodeKey(container []byte, points decompressor) ([]byte, error) {
	in := &cursor{data: container}
	out := bytes.NewBuffer(make([]byte, 0, len(container)*2))
	header, err := in.take(keyHeaderBytes + domainBytes)
	if err != nil {
		return nil, err
	}
	out.Write(header)
	// Alpha, Beta, Delta, then A, B, Z and K.
	for i := 0; i < 3; i++ {
		if err := transcodePoint(in, out, 32, points.g1); err != nil {
			return nil, err
		}
	}
	for i := 0; i < 4; i++ {
		if err := transcodeSlice(in, out, 32, points.g1); err != nil {
			return nil, err
		}
	}
	// G2: Beta, Delta, then B.
	for i := 0; i < 2; i++ {
		if err := transcodePoint(in, out, 64, points.g2); err != nil {
			return nil, err
		}
	}
	if err := transcodeSlice(in, out, 64, points.g2); err != nil {
		return nil, err
	}
	// nbWires, NbInfinityA and NbInfinityB, then one byte per wire for
	// InfinityA and InfinityB.
	counts, err := in.take(3 * 8)
	if err != nil {
		return nil, err
	}
	out.Write(counts)
	nbWires := binary.BigEndian.Uint64(counts)
	if nbWires > uint64(len(container)) {
		return nil, errTranscode
	}
	flags, err := in.take(int(2 * nbWires))
	if err != nil {
		return nil, err
	}
	out.Write(flags)
	// The commitment keys: a basis and its sigma multiples, each a G1 slice.
	count, err := in.take(4)
	if err != nil {
		return nil, err
	}
	out.Write(count)
	for i := uint32(0); i < binary.BigEndian.Uint32(count); i++ {
		for j := 0; j < 2; j++ {
			if err := transcodeSlice(in, out, 32, points.g1); err != nil {
				return nil, err
			}
		}
	}
	// The verifying key is small: gnark decodes it and writes it raw.
	vk := groth16.NewVerifyingKey(ecc.BN254)
	read, err := vk.UnsafeReadFrom(bytes.NewReader(in.rest()))
	if err != nil {
		return nil, errTranscode
	}
	if _, err := in.take(int(read)); err != nil {
		return nil, err
	}
	if _, err := vk.WriteRawTo(out); err != nil {
		return nil, fmt.Errorf("encoding verifying key: %w", err)
	}
	// The constraint system holds no points.
	out.Write(in.rest())
	return out.Bytes(), nil
}

// transcodePoint copies one point, raw: a point that is compressed is
// decompressed by `decompress`.
func transcodePoint(in *cursor, out *bytes.Buffer, size int, decompress func([]byte) ([]byte, error)) error {
	compressed, err := in.take(size)
	if err != nil {
		return err
	}
	if compressed[0]&pointMask == 0 {
		return errTranscode
	}
	raw, err := decompress(compressed)
	if err != nil {
		return err
	}
	out.Write(raw)
	return nil
}

// transcodeSlice copies a slice of points, its count then the points raw.
func transcodeSlice(in *cursor, out *bytes.Buffer, size int, decompress func([]byte) ([]byte, error)) error {
	count, err := in.take(4)
	if err != nil {
		return err
	}
	out.Write(count)
	length := int(binary.BigEndian.Uint32(count))
	if length == 0 {
		return nil
	}
	compressed, err := in.take(length * size)
	if err != nil {
		return err
	}
	for i := 0; i < length; i++ {
		if compressed[i*size]&pointMask == 0 {
			return errTranscode
		}
	}
	raw, err := decompress(compressed)
	if err != nil {
		return err
	}
	if len(raw) != length*size*2 {
		return errTranscode
	}
	out.Write(raw)
	return nil
}

// compressedContainer reports whether a `.key` container stores its points
// compressed: its first point says.
func compressedContainer(container []byte) bool {
	return len(container) > keyHeaderBytes+domainBytes &&
		container[keyHeaderBytes+domainBytes]&pointMask != 0
}

type cursor struct {
	data []byte
	at   int
}

func (c *cursor) take(n int) ([]byte, error) {
	if n < 0 || n > len(c.data)-c.at {
		return nil, errTranscode
	}
	taken := c.data[c.at : c.at+n]
	c.at += n
	return taken, nil
}

func (c *cursor) rest() []byte {
	return c.data[c.at:]
}

// goDecompressor decompresses with gnark itself, one point at a time: what
// a build without the browser kernel would do, and what the tests compare
// the kernel against.
type goDecompressor struct{}

func (goDecompressor) g1(compressed []byte) ([]byte, error) {
	raw := make([]byte, 0, len(compressed)*2)
	for i := 0; i+32 <= len(compressed); i += 32 {
		var point curve.G1Affine
		if _, err := point.SetBytes(compressed[i : i+32]); err != nil {
			return nil, err
		}
		encoded := point.RawBytes()
		raw = append(raw, encoded[:]...)
	}
	return raw, nil
}

func (goDecompressor) g2(compressed []byte) ([]byte, error) {
	raw := make([]byte, 0, len(compressed)*2)
	for i := 0; i+64 <= len(compressed); i += 64 {
		var point curve.G2Affine
		if _, err := point.SetBytes(compressed[i : i+64]); err != nil {
			return nil, err
		}
		encoded := point.RawBytes()
		raw = append(raw, encoded[:]...)
	}
	return raw, nil
}
