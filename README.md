# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 9V45 96-Core Processor, 16 GiB, 4 threads, Chrome 155

**After:** [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) of 2026-10-17. No report of `main` to compare with yet.

| by scenario | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| first run, including download | 3.16 s (download: 1.06 s, 8.8 MiB) | 3.80 s (download: 0.43 s, 15.6 MiB) | 6.55 s (download: 0.55 s, 28.9 MiB) | 12.10 s (download: 0.82 s, 55.9 MiB) | 23.61 s (download: 1.84 s, 109.5 MiB) | 37.46 s (download: 2.44 s, 171.6 MiB) | 35.53 s (download: 2.24 s, 165.0 MiB) |
| warm | 0.58 s | 1.15 s | 1.65 s | 3.04 s | 5.32 s | 8.70 s | 8.35 s |
| first run after restart | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |
| repeated after restart | 0.62 s | 1.18 s | 1.64 s | 3.00 s | 5.39 s | 8.70 s | 8.52 s |

| by stage | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| key load | 0.15 s | 0.27 s | 0.54 s | 0.90 s | 1.78 s | 2.86 s | 2.78 s |
| witness | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### Proof, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**After:** [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) of 2026-10-17. No report of `main` to compare with yet.

| by scenario | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| first run, including download | 8.34 s (download: 3.82 s, 8.8 MiB) | 7.87 s (download: 0.99 s, 15.6 MiB) | 12.01 s (download: 1.39 s, 28.9 MiB) | 40.35 s (download: 3.65 s, 55.9 MiB) | 55.32 s (download: 7.94 s, 109.5 MiB) | 100.10 s (download: 11.28 s, 171.6 MiB) | 84.44 s (download: 8.87 s, 165.0 MiB) |
| warm | 0.73 s | 1.42 s | 1.95 s | 6.16 s | 7.98 s | 12.14 s | 11.27 s |
| first run after restart | 1.74 s | 2.44 s | 4.82 s | 7.75 s | 16.21 s | 21.20 s | 19.76 s |
| repeated after restart | 1.05 s | 1.13 s | 2.36 s | 4.40 s | 5.60 s | 10.92 s | 11.58 s |

| by stage | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| key load | 0.43 s | 0.67 s | 1.41 s | 2.17 s | 6.36 s | 6.02 s | 7.11 s |
| witness | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### Proof, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 1.74 s | 2.44 s | 4.82 s | 7.75 s | 16.21 s | 21.20 s | 19.76 s |

## chrome

**After:** [`c7595d0`](https://github.com/helius-labs/zolana-web-sdk/commit/c7595d09889d88b992db7abaf1f654962c7c4dad) of 2026-10-17. No report of `main` to compare with yet.

| by scenario | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| first run, including download | 5.75 s (download: 1.94 s, 8.8 MiB) | 7.81 s (download: 0.64 s, 15.6 MiB) | 12.08 s (download: 1.32 s, 28.9 MiB) | 22.52 s (download: 1.80 s, 55.9 MiB) | 41.95 s (download: 2.16 s, 109.5 MiB) | 66.68 s (download: 3.10 s, 171.6 MiB) | 64.38 s (download: 2.81 s, 165.0 MiB) |
| warm | 1.07 s | 1.88 s | 2.86 s | 5.32 s | 9.53 s | 15.21 s | 14.95 s |
| first run after restart | 1.73 s | 2.46 s | 4.17 s | 7.24 s | 13.17 s | 20.63 s | 20.27 s |
| repeated after restart | 1.15 s | 1.66 s | 2.94 s | 5.30 s | 9.55 s | 15.32 s | 15.06 s |

| by stage | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|
| key load | 0.28 s | 0.41 s | 0.74 s | 1.45 s | 2.80 s | 4.53 s | 4.52 s |
| witness | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | 1.00 s | 1.61 s | 2.82 s | 5.25 s | 9.49 s | 15.16 s | 14.87 s |

### Proof, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`c7595d0`](https://github.com/helius-labs/zolana-web-sdk/commit/c7595d09889d88b992db7abaf1f654962c7c4dad) | 2026-10-17 | 1.00 s | 1.61 s | 2.82 s | 5.25 s | 9.49 s | 15.16 s | 14.87 s |

### First run after a restart, last 1 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`c7595d0`](https://github.com/helius-labs/zolana-web-sdk/commit/c7595d09889d88b992db7abaf1f654962c7c4dad) | 2026-10-17 | 1.73 s | 2.46 s | 4.17 s | 7.24 s | 13.17 s | 20.63 s | 20.27 s |
