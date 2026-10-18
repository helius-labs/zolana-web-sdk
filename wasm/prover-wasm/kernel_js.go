//go:build js && wasm

package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"runtime"
	"syscall/js"

	curve "github.com/consensys/gnark-crypto/ecc/bn254"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	native "github.com/consensys/gnark/backend/groth16/bn254"
)

type browserKernel struct {
	key    js.Value
	solver bool
	// gpu: the key holds the page's WebGPU device, and proves through it
	// when the call can wait (proveAsync).
	gpu bool
}

// asyncProving is set while proveAsync runs: the kernel may then wait on
// a Promise, which a synchronous call from JavaScript cannot.
var asyncProving bool

// await waits for a Promise from inside a goroutine, the event loop running
// meanwhile.
func await(promise js.Value) (js.Value, error) {
	done := make(chan struct{})
	var value, failure js.Value
	resolved := false
	then := js.FuncOf(func(_ js.Value, args []js.Value) any {
		value, resolved = args[0], true
		close(done)
		return nil
	})
	catch := js.FuncOf(func(_ js.Value, args []js.Value) any {
		failure = args[0]
		close(done)
		return nil
	})
	defer then.Release()
	defer catch.Release()
	promise.Call("then", then, catch)
	<-done
	if !resolved {
		return js.Value{}, fmt.Errorf("kernel: %s", failure.Call("toString").String())
	}
	return value, nil
}

func prepareKernel(c *preparedCircuit) {
	// Small circuits cost less in the existing Go implementation.
	constructor := js.Global().Get("__moproGnarkKernel")
	if c.pk == nil || c.cs.GetNbConstraints() < 1024 || constructor.Type() != js.TypeFunction {
		return
	}
	pk := c.pk.(*native.ProvingKey)
	kernel := &browserKernel{key: constructor.New(packKernel(pk.G1.A), packKernel(pk.G1.B), packKernel(pk.G1.K), packKernel(pk.G1.Z), packKernel(pk.G2.B), packKernel([]fr.Element{pk.Domain.Generator, pk.Domain.FrMultiplicativeGen}))}
	installed := false
	defer func() {
		if !installed {
			kernel.close()
		}
	}()
	for _, commitment := range pk.CommitmentKeys {
		kernel.key.Call("add_commitment", packKernel(commitment.Basis), packKernel(commitment.BasisExpSigma))
	}
	if program := kernelSolverProgram(c.cs, pk.InfinityA, pk.InfinityB); program != nil {
		kernel.solver = kernel.key.Call("set_solver", packKernel(program), packKernelFields(c.cs.Coefficients)).Bool()
		kernel.gpu = kernel.solver && kernel.key.Get("has_gpu").Type() == js.TypeFunction && kernel.key.Call("has_gpu").Bool()
	}
	c.kernel = kernel
	installed = true
	// The kernel holds the points now. The accelerated prover needs only the
	// fixed points, the infinity flags and the commitment keys of the Go
	// copy, so the slices go: for a wide key they are most of the heap.
	pk.G1.A, pk.G1.B, pk.G1.K, pk.G1.Z, pk.G2.B = nil, nil, nil, nil, nil
	runtime.GC()
}

// Gnark and arkworks use the same four little-endian Montgomery limbs, which
// is how these types lie in memory on wasm (little-endian, no padding), so the
// bytes go to the JS heap as they are, without a copy or reflection in Go.
// Only decoded keys, validated solver plans and field elements cross this
// bridge.
func packKernel(value any) js.Value {
	var data []byte
	switch value := value.(type) {
	case []curve.G1Affine:
		data = bytesOf(value)
	case []curve.G2Affine:
		data = bytesOf(value)
	case []fr.Element:
		data = bytesOf(value)
	case []uint32:
		data = bytesOf(value)
	default:
		panic(fmt.Sprintf("packKernel: unsupported %T", value))
	}
	out := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(out, data)
	return out
}

func packKernelFields(values []fr.Element) js.Value {
	return packKernel(values)
}

func (k *browserKernel) parts(sa, sb, sk, a, b, c []fr.Element) (kernelParts, error) {
	result := k.key.Call("parts", packKernelFields(sa), packKernelFields(sb), packKernelFields(sk), packKernelFields(a), packKernelFields(b), packKernelFields(c))
	return unpackKernelParts(result)
}
func (k *browserKernel) solveParts(witness []fr.Element) (kernelParts, bool, error) {
	if !k.solver {
		return kernelParts{}, false, nil
	}
	if k.gpu && asyncProving {
		result, err := await(k.key.Call("solve_parts_gpu", packKernelFields(witness)))
		if err != nil {
			return kernelParts{}, true, err
		}
		parts, err := unpackKernelParts(result)
		return parts, true, err
	}
	parts, err := unpackKernelParts(k.key.Call("solve_parts", packKernelFields(witness)))
	return parts, true, err
}
func unpackKernelParts(result js.Value) (kernelParts, error) {
	var out kernelParts
	data := byteArray(result)
	if len(data) != 384 {
		return out, fmt.Errorf("invalid accelerated proof parts")
	}
	reader := bytes.NewReader(data)
	for _, point := range []any{&out.a, &out.b, &out.k, &out.z, &out.b2} {
		if err := binary.Read(reader, binary.LittleEndian, point); err != nil {
			return out, err
		}
	}
	return out, nil
}
func (k *browserKernel) close() { k.key.Call("free") }

func (k *browserKernel) provesOnGPU() bool { return k.gpu && asyncProving }
func (k *browserKernel) dropGPU()          { k.gpu = false }

// kernelDecompressor is the kernel's point decompression, when the runtime
// has it; nil otherwise.
func kernelDecompressor() decompressor {
	functions := js.Global().Get("__moproGnarkDecompress")
	if functions.Type() != js.TypeObject {
		return nil
	}
	return &jsDecompressor{functions: functions}
}

type jsDecompressor struct {
	functions js.Value
}

func (d *jsDecompressor) g1(compressed []byte) ([]byte, error) {
	return d.call("g1", compressed)
}

func (d *jsDecompressor) g2(compressed []byte) ([]byte, error) {
	return d.call("g2", compressed)
}

// A kernel error arrives as a JS exception, which Go sees as a panic.
func (d *jsDecompressor) call(name string, compressed []byte) (raw []byte, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			raw, err = nil, fmt.Errorf("kernel decompression: %v", recovered)
		}
	}()
	input := js.Global().Get("Uint8Array").New(len(compressed))
	js.CopyBytesToJS(input, compressed)
	return byteArray(d.functions.Call(name, input)), nil
}

func (k *browserKernel) commitment(index int, knowledge bool, values []fr.Element) (curve.G1Affine, error) {
	var out curve.G1Affine
	data := byteArray(k.key.Call("commitment", index, knowledge, packKernelFields(values)))
	if len(data) != 64 {
		return out, fmt.Errorf("invalid accelerated commitment")
	}
	err := binary.Read(bytes.NewReader(data), binary.LittleEndian, &out)
	return out, err
}
