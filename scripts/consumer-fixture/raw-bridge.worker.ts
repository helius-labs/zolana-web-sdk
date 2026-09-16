const runtime = globalThis as unknown as {
  Go: new () => {
    importObject: WebAssembly.Imports;
    run(instance: WebAssembly.Instance): Promise<void>;
  };
  __zolanaProverReady: () => void;
  __zolanaProver: {
    prove(body: string): unknown;
    verify(body: string, proof: string): unknown;
    loadKey(name: string, bytes: unknown): unknown;
  };
};

globalThis.addEventListener("message", async (event: MessageEvent<string>) => {
  try {
    const shimUrl = "/raw-wasm-exec.js";
    await import(/* @vite-ignore */ shimUrl);
    const ready = new Promise<void>((resolve) => {
      runtime.__zolanaProverReady = resolve;
    });
    const go = new runtime.Go();
    const { instance } = await WebAssembly.instantiateStreaming(
      fetch("/prover/zolana-prover.wasm"),
      go.importObject,
    );
    void go.run(instance);
    await ready;
    const api = runtime.__zolanaProver;
    const failures = [
      api.prove(event.data),
      api.verify(event.data, "{}"),
      api.prove('{"circuitType":"review-private-sentinel"}'),
      api.loadKey("transfer_confidential_2_3.key", "review-private-sentinel"),
    ];
    globalThis.postMessage({ failures });
  } catch {
    globalThis.postMessage({ error: "Raw bridge test failed" });
  }
});
