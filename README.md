# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 9V74 80-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) of 2026-10-20. **After:** [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 4.96 s (download: 1.04 s, 8.8 MiB) | 8.25 s (download: 0.77 s, 15.6 MiB) | 12.38 s (download: 0.80 s, 28.9 MiB) | 23.16 s (download: 1.24 s, 55.9 MiB) | 44.45 s (download: 2.20 s, 109.5 MiB) | 70.72 s (download: 2.98 s, 171.6 MiB) | 68.44 s (download: 2.95 s, 165.0 MiB) |
| | after | 5.44 s (download: 2.19 s, 8.8 MiB) (+10 %) | 6.79 s (download: 0.69 s, 15.6 MiB) (-18 %) | 10.28 s (download: 0.92 s, 28.9 MiB) (-17 %) | 19.67 s (download: 1.45 s, 55.9 MiB) (-15 %) | 37.64 s (download: 2.61 s, 109.5 MiB) (-15 %) | 60.75 s (download: 4.01 s, 171.6 MiB) (-14 %) | 58.39 s (download: 3.93 s, 165.0 MiB) (-15 %) |
| warm | before | 1.04 s | 2.18 s | 2.97 s | 5.45 s | 9.91 s | 15.73 s | 15.27 s |
| | after | 1.09 s (+5 %) | 1.65 s (-24 %) | 2.14 s (-28 %) | 3.97 s (-27 %) | 7.16 s (-28 %) | 11.68 s (-26 %) | 11.31 s (-26 %) |
| first run after restart | before | 1.70 s | 2.54 s | 4.27 s | 7.30 s | 13.23 s | 21.07 s | 20.46 s |
| | after | 1.31 s (-23 %) | 2.03 s (-20 %) | 3.20 s (-25 %) | 5.81 s (-20 %) | 10.83 s (-18 %) | 17.81 s (-16 %) | 17.02 s (-17 %) |
| repeated after restart | before | 1.04 s | 1.70 s | 2.92 s | 5.41 s | 9.77 s | 15.65 s | 15.33 s |
| | after | 0.73 s (-30 %) | 1.23 s (-27 %) | 2.15 s (-27 %) | 3.96 s (-27 %) | 7.19 s (-26 %) | 11.90 s (-24 %) | 11.36 s (-26 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.27 s | 0.42 s | 0.75 s | 1.40 s | 2.79 s | 4.58 s | 4.37 s |
| | after | 0.24 s | 0.41 s | 0.72 s | 1.41 s | 3.05 s (+9 %) | 5.39 s (+18 %) | 5.07 s (+16 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.97 s | 1.84 s | 2.91 s | 5.35 s | 9.77 s | 15.64 s | 15.22 s |
| | after | 0.70 s (-28 %) | 1.38 s (-25 %) | 2.10 s (-28 %) | 3.92 s (-27 %) | 7.17 s (-27 %) | 11.78 s (-25 %) | 11.31 s (-26 %) |

### Proof, last 7 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 0.70 s | 1.38 s | 2.10 s | 3.92 s | 7.17 s | 11.78 s | 11.31 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.97 s | 1.84 s | 2.91 s | 5.35 s | 9.77 s | 15.64 s | 15.22 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.13 s | 1.63 s | 2.93 s | 5.45 s | 9.78 s | 15.90 s | 14.99 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 1.23 s | 1.64 s | 2.91 s | 5.33 s | 9.72 s | 15.46 s | 15.10 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 7 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 1.31 s | 2.03 s | 3.20 s | 5.81 s | 10.83 s | 17.81 s | 17.02 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 1.70 s | 2.54 s | 4.27 s | 7.30 s | 13.23 s | 21.07 s | 20.46 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.97 s | 2.48 s | 4.13 s | 7.53 s | 13.45 s | 20.98 s | 19.87 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 2.15 s | 2.50 s | 4.20 s | 7.20 s | 13.03 s | 20.59 s | 20.02 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) of 2026-10-20. **After:** [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 8.91 s (download: 4.28 s, 8.8 MiB) | 6.35 s (download: 0.70 s, 15.6 MiB) | 27.15 s (download: 4.87 s, 28.9 MiB) | 28.14 s (download: 5.72 s, 55.9 MiB) | 57.24 s (download: 9.02 s, 109.5 MiB) | 116.06 s (download: 20.41 s, 171.6 MiB) | 114.23 s (download: 19.83 s, 165.0 MiB) |
| | after | 6.21 s (download: 1.94 s, 8.8 MiB) (-30 %) | 6.39 s (download: 0.61 s, 15.6 MiB) | 13.85 s (download: 1.14 s, 28.9 MiB) (-49 % **!**) | 19.49 s (download: 1.48 s, 55.9 MiB) (-31 %) | 40.74 s (download: 3.73 s, 109.5 MiB) (-29 %) | 69.25 s (download: 7.07 s, 171.6 MiB) (-40 % **!**) | 86.23 s (download: 9.96 s, 165.0 MiB) (-25 %) |
| warm | before | 0.92 s | 1.21 s | 4.04 s | 3.92 s | 8.07 s | 12.95 s | 14.32 s |
| | after | 0.63 s (-32 %) | 0.98 s (-18 %) | 2.75 s (-32 %) | 2.85 s (-27 %) | 4.93 s (-39 % **!**) | 13.96 s (+8 %) | 12.06 s (-16 %) |
| first run after restart | before | 1.29 s | 2.98 s | 6.92 s | 7.18 s | 14.27 s | 28.01 s | 29.14 s |
| | after | 1.57 s (+22 %) | 1.96 s (-34 %) | 4.60 s (-34 %) | 4.76 s (-34 %) | 8.38 s (-41 % **!**) | 32.45 s (+16 %) | 22.49 s (-23 %) |
| repeated after restart | before | 0.56 s | 1.58 s | 3.07 s | 3.78 s | 7.19 s | 15.23 s | 13.68 s |
| | after | 0.84 s (+51 % **!**) | 1.21 s (-23 %) | 2.69 s (-12 %) | 2.95 s (-22 %) | 5.40 s (-25 %) | 16.03 s (+5 %) | 11.71 s (-14 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.23 s | 0.58 s | 1.73 s | 1.96 s | 4.51 s | 9.69 s | 10.45 s |
| | after | 0.31 s (+35 %) | 0.49 s (-16 %) | 1.18 s (-32 %) | 1.57 s (-20 %) | 2.96 s (-34 %) | 12.05 s (+24 %) | 7.77 s (-26 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.70 s | 1.42 s | 3.78 s | 3.79 s | 7.82 s | 14.45 s | 14.96 s |
| | after | 0.60 s (-14 %) | 1.04 s (-27 %) | 2.66 s (-30 %) | 2.82 s (-25 %) | 5.11 s (-35 %) | 14.85 s (+3 %) | 11.76 s (-21 %) |

### Proof, last 7 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 0.60 s | 1.04 s | 2.66 s | 2.82 s | 5.11 s | 14.85 s | 11.76 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.70 s | 1.42 s | 3.78 s | 3.79 s | 7.82 s | 14.45 s | 14.96 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 0.79 s | 1.72 s | 3.03 s | 3.85 s | 6.97 s | 11.52 s | 11.26 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 0.58 s | 1.46 s | 3.00 s | 3.33 s | 7.48 s | 12.05 s | 11.54 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 7 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 1.57 s | 1.96 s | 4.60 s | 4.76 s | 8.38 s | 32.45 s | 22.49 s |
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
