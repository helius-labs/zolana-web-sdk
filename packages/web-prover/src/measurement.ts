export interface Measurement {
  readonly step: "key-fetch" | "key-load" | "transfer-prove";
  readonly ms: number;
  readonly bytes?: number;
  readonly note?: string;
}
