/** Progress of one proving key's load, for a download or preparation indicator. */
export interface KeyProgress {
  readonly keyFile: string;
  /**
   * `download` as bytes arrive from the network; `decode` once, when the worker
   * starts loading the key (seconds for a key's first load, then a fraction).
   */
  readonly stage: "download" | "decode";
  readonly loaded: number;
  readonly total: number;
}

export interface Measurement {
  readonly step: "key-fetch" | "key-load" | "transfer-prove";
  readonly ms: number;
  readonly bytes?: number;
  readonly note?: string;
}
