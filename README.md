# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 7763 64-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) of 2026-10-20. **After:** [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 3.75 s (download: 0.96 s, 8.8 MiB) | 5.95 s (download: 0.53 s, 15.6 MiB) | 8.66 s (download: 0.65 s, 28.9 MiB) | 16.59 s (download: 0.98 s, 55.9 MiB) | 31.91 s (download: 1.70 s, 109.5 MiB) | 50.28 s (download: 2.52 s, 171.6 MiB) | 48.42 s (download: 2.33 s, 165.0 MiB) |
| | after | 5.18 s (download: 1.16 s, 8.8 MiB) (+38 % **!**) | 7.71 s (download: 0.77 s, 15.6 MiB) (+30 %) | 12.46 s (download: 0.96 s, 28.9 MiB) (+44 % **!**) | 23.55 s (download: 1.53 s, 55.9 MiB) (+42 % **!**) | 44.93 s (download: 2.56 s, 109.5 MiB) (+41 % **!**) | 71.95 s (download: 3.80 s, 171.6 MiB) (+43 % **!**) | 68.63 s (download: 3.48 s, 165.0 MiB) (+42 % **!**) |
| warm | before | 0.76 s | 1.38 s | 2.17 s | 4.01 s | 7.30 s | 11.83 s | 11.88 s |
| | after | 1.31 s (+74 % **!**) | 1.70 s (+23 %) | 2.95 s (+36 % **!**) | 5.41 s (+35 %) | 9.83 s (+35 %) | 15.47 s (+31 %) | 15.13 s (+27 %) |
| first run after restart | before | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| | after | 2.15 s (+80 % **!**) | 2.50 s (+38 % **!**) | 4.20 s (+37 % **!**) | 7.20 s (+31 %) | 13.03 s (+27 %) | 20.59 s (+24 %) | 20.02 s (+26 %) |
| repeated after restart | before | 0.79 s | 1.23 s | 2.25 s | 4.07 s | 7.29 s | 11.90 s | 11.71 s |
| | after | 1.32 s (+68 % **!**) | 1.70 s (+38 % **!**) | 2.97 s (+32 %) | 5.38 s (+32 %) | 9.73 s (+33 %) | 15.55 s (+31 %) | 15.29 s (+30 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.19 s | 0.31 s | 0.56 s | 1.09 s | 2.33 s | 3.73 s | 3.64 s |
| | after | 0.30 s (+58 % **!**) | 0.44 s (+42 % **!**) | 0.77 s (+38 % **!**) | 1.38 s (+27 %) | 2.80 s (+20 %) | 4.50 s (+21 %) | 4.30 s (+18 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| | after | 1.23 s (+67 % **!**) | 1.64 s (+27 %) | 2.91 s (+34 %) | 5.33 s (+33 %) | 9.72 s (+33 %) | 15.46 s (+31 %) | 15.10 s (+30 %) |

### Proof, last 4 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 1.23 s | 1.64 s | 2.91 s | 5.33 s | 9.72 s | 15.46 s | 15.10 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 4 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 2.15 s | 2.50 s | 4.20 s | 7.20 s | 13.03 s | 20.59 s | 20.02 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) of 2026-10-20. **After:** [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 8.74 s (download: 3.88 s, 8.8 MiB) | 5.55 s (download: 0.84 s, 15.6 MiB) | 25.76 s (download: 3.31 s, 28.9 MiB) | 23.93 s (download: 3.42 s, 55.9 MiB) | 50.68 s (download: 6.55 s, 109.5 MiB) | 81.26 s (download: 10.87 s, 171.6 MiB) | 93.99 s (download: 12.25 s, 165.0 MiB) |
| | after | 6.90 s (download: 3.27 s, 8.8 MiB) (-21 %) | 7.98 s (download: 1.41 s, 15.6 MiB) (+44 % **!**) | 17.59 s (download: 1.72 s, 28.9 MiB) (-32 %) | 24.54 s (download: 3.55 s, 55.9 MiB) (+3 %) | 47.73 s (download: 6.06 s, 109.5 MiB) (-6 %) | 99.72 s (download: 15.11 s, 171.6 MiB) (+23 %) | 89.21 s (download: 11.67 s, 165.0 MiB) (-5 %) |
| warm | before | 0.84 s | 1.18 s | 3.47 s | 2.85 s | 6.03 s | 11.44 s | 12.00 s |
| | after | 0.66 s (-22 %) | 1.50 s (+27 %) | 3.48 s | 3.08 s (+8 %) | 7.94 s (+32 %) | 12.12 s (+6 %) | 9.12 s (-24 %) |
| first run after restart | before | 1.47 s | 3.14 s | 5.53 s | 6.00 s | 12.27 s | 21.24 s | 19.75 s |
| | after | 2.60 s (+77 % **!**) | 2.70 s (-14 %) | 5.03 s (-9 %) | 5.64 s (-6 %) | 12.64 s (+3 %) | 22.16 s (+4 %) | 21.26 s (+8 %) |
| repeated after restart | before | 0.66 s | 1.30 s | 3.38 s | 3.48 s | 5.31 s | 10.81 s | 10.71 s |
| | after | 0.62 s | 1.55 s (+19 %) | 2.48 s (-27 %) | 3.46 s | 7.61 s (+43 % **!**) | 12.18 s (+13 %) | 11.30 s (+6 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.34 s | 0.50 s | 1.52 s | 1.97 s | 3.96 s | 7.50 s | 6.35 s |
| | after | 0.42 s (+24 %) | 0.54 s | 1.23 s (-19 %) | 1.90 s (-4 %) | 3.73 s (-6 %) | 7.66 s (+2 %) | 6.13 s (-3 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| | after | 0.58 s | 1.46 s (+23 %) | 3.00 s (-10 %) | 3.33 s (+3 %) | 7.48 s (+22 %) | 12.05 s (+9 %) | 11.54 s (+2 %) |

### Proof, last 4 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 0.58 s | 1.46 s | 3.00 s | 3.33 s | 7.48 s | 12.05 s | 11.54 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 4 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
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
