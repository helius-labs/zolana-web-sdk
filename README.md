# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 7763 64-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) of 2026-10-20. **After:** [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 5.30 s (download: 1.36 s, 8.8 MiB) | 8.20 s (download: 0.86 s, 15.6 MiB) | 12.82 s (download: 1.38 s, 28.9 MiB) | 24.07 s (download: 1.95 s, 55.9 MiB) | 50.44 s (download: 7.65 s, 109.5 MiB) | 79.22 s (download: 10.36 s, 171.6 MiB) | 74.74 s (download: 9.26 s, 165.0 MiB) |
| | after | 4.96 s (download: 1.04 s, 8.8 MiB) (-6 %) | 8.25 s (download: 0.77 s, 15.6 MiB) | 12.38 s (download: 0.80 s, 28.9 MiB) (-3 %) | 23.16 s (download: 1.24 s, 55.9 MiB) (-4 %) | 44.45 s (download: 2.20 s, 109.5 MiB) (-12 %) | 70.72 s (download: 2.98 s, 171.6 MiB) (-11 %) | 68.44 s (download: 2.95 s, 165.0 MiB) (-8 %) |
| warm | before | 1.02 s | 1.99 s | 2.98 s | 5.52 s | 9.84 s | 15.81 s | 15.20 s |
| | after | 1.04 s | 2.18 s (+10 %) | 2.97 s | 5.45 s (-1 %) | 9.91 s (+1 %) | 15.73 s (-1 %) | 15.27 s (+0 %) |
| first run after restart | before | 1.97 s | 2.48 s | 4.13 s | 7.53 s | 13.45 s | 20.98 s | 19.87 s |
| | after | 1.70 s (-14 %) | 2.54 s (+3 %) | 4.27 s (+3 %) | 7.30 s (-3 %) | 13.23 s (-2 %) | 21.07 s (+0 %) | 20.46 s (+3 %) |
| repeated after restart | before | 1.28 s | 1.68 s | 3.05 s | 5.51 s | 9.73 s | 16.17 s | 15.10 s |
| | after | 1.04 s (-19 %) | 1.70 s | 2.92 s (-4 %) | 5.41 s (-2 %) | 9.77 s | 15.65 s (-3 %) | 15.33 s (+2 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.33 s | 0.43 s | 0.74 s | 1.55 s | 2.95 s | 4.71 s | 4.29 s |
| | after | 0.27 s (-18 %) | 0.42 s | 0.75 s | 1.40 s (-10 %) | 2.79 s (-5 %) | 4.58 s (-3 %) | 4.37 s (+2 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 1.13 s | 1.63 s | 2.93 s | 5.45 s | 9.78 s | 15.90 s | 14.99 s |
| | after | 0.97 s (-14 %) | 1.84 s (+13 %) | 2.91 s | 5.35 s (-2 %) | 9.77 s | 15.64 s (-2 %) | 15.22 s (+2 %) |

### Proof, last 6 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.97 s | 1.84 s | 2.91 s | 5.35 s | 9.77 s | 15.64 s | 15.22 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.13 s | 1.63 s | 2.93 s | 5.45 s | 9.78 s | 15.90 s | 14.99 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 1.23 s | 1.64 s | 2.91 s | 5.33 s | 9.72 s | 15.46 s | 15.10 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 6 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 1.70 s | 2.54 s | 4.27 s | 7.30 s | 13.23 s | 21.07 s | 20.46 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.97 s | 2.48 s | 4.13 s | 7.53 s | 13.45 s | 20.98 s | 19.87 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 2.15 s | 2.50 s | 4.20 s | 7.20 s | 13.03 s | 20.59 s | 20.02 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) of 2026-10-20. **After:** [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 7.34 s (download: 2.96 s, 8.8 MiB) | 8.77 s (download: 1.55 s, 15.6 MiB) | 19.28 s (download: 1.64 s, 28.9 MiB) | 29.36 s (download: 3.03 s, 55.9 MiB) | 47.41 s (download: 4.33 s, 109.5 MiB) | 93.41 s (download: 9.57 s, 171.6 MiB) | 93.71 s (download: 13.52 s, 165.0 MiB) |
| | after | 8.91 s (download: 4.28 s, 8.8 MiB) (+21 %) | 6.35 s (download: 0.70 s, 15.6 MiB) (-28 %) | 27.15 s (download: 4.87 s, 28.9 MiB) (+41 % **!**) | 28.14 s (download: 5.72 s, 55.9 MiB) (-4 %) | 57.24 s (download: 9.02 s, 109.5 MiB) (+21 %) | 116.06 s (download: 20.41 s, 171.6 MiB) (+24 %) | 114.23 s (download: 19.83 s, 165.0 MiB) (+22 %) |
| warm | before | 0.85 s | 1.60 s | 3.36 s | 3.67 s | 7.13 s | 11.51 s | 12.20 s |
| | after | 0.92 s (+8 %) | 1.21 s (-25 %) | 4.04 s (+20 %) | 3.92 s (+7 %) | 8.07 s (+13 %) | 12.95 s (+13 %) | 14.32 s (+17 %) |
| first run after restart | before | 2.01 s | 3.12 s | 4.63 s | 6.22 s | 12.58 s | 20.95 s | 20.14 s |
| | after | 1.29 s (-36 % **!**) | 2.98 s (-4 %) | 6.92 s (+49 % **!**) | 7.18 s (+15 %) | 14.27 s (+13 %) | 28.01 s (+34 %) | 29.14 s (+45 % **!**) |
| repeated after restart | before | 0.77 s | 1.82 s | 3.04 s | 4.20 s | 7.87 s | 10.67 s | 10.54 s |
| | after | 0.56 s (-28 %) | 1.58 s (-13 %) | 3.07 s | 3.78 s (-10 %) | 7.19 s (-9 %) | 15.23 s (+43 % **!**) | 13.68 s (+30 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.39 s | 0.67 s | 1.18 s | 2.15 s | 4.59 s | 6.95 s | 7.48 s |
| | after | 0.23 s (-41 % **!**) | 0.58 s (-13 %) | 1.73 s (+47 % **!**) | 1.96 s (-9 %) | 4.51 s (-2 %) | 9.69 s (+39 % **!**) | 10.45 s (+40 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.79 s | 1.72 s | 3.03 s | 3.85 s | 6.97 s | 11.52 s | 11.26 s |
| | after | 0.70 s (-11 %) | 1.42 s (-17 %) | 3.78 s (+25 %) | 3.79 s (-1 %) | 7.82 s (+12 %) | 14.45 s (+25 %) | 14.96 s (+33 %) |

### Proof, last 6 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.70 s | 1.42 s | 3.78 s | 3.79 s | 7.82 s | 14.45 s | 14.96 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 0.79 s | 1.72 s | 3.03 s | 3.85 s | 6.97 s | 11.52 s | 11.26 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 0.58 s | 1.46 s | 3.00 s | 3.33 s | 7.48 s | 12.05 s | 11.54 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 6 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 1.29 s | 2.98 s | 6.92 s | 7.18 s | 14.27 s | 28.01 s | 29.14 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 2.01 s | 3.12 s | 4.63 s | 6.22 s | 12.58 s | 20.95 s | 20.14 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 2.60 s | 2.70 s | 5.03 s | 5.64 s | 12.64 s | 22.16 s | 21.26 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.47 s | 3.14 s | 5.53 s | 6.00 s | 12.27 s | 21.24 s | 19.75 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 1.50 s | 2.54 s | 7.10 s | 7.18 s | 13.84 s | 27.89 s | 21.02 s |
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
