# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, Intel(R) Xeon(R) 6973P-C, 16 GiB, 4 threads, Chrome 155

**Before:** [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) of 2026-10-20. **After:** [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 2.95 s (download: 0.93 s, 8.8 MiB) | 3.89 s (download: 0.46 s, 15.6 MiB) | 6.94 s (download: 0.59 s, 28.9 MiB) | 11.94 s (download: 0.78 s, 55.9 MiB) | 26.98 s (download: 5.53 s, 109.5 MiB) | 42.25 s (download: 7.78 s, 171.6 MiB) | 40.75 s (download: 7.75 s, 165.0 MiB) |
| | after | 3.75 s (download: 0.96 s, 8.8 MiB) (+27 %) | 5.95 s (download: 0.53 s, 15.6 MiB) (+53 % **!**) | 8.66 s (download: 0.65 s, 28.9 MiB) (+25 %) | 16.59 s (download: 0.98 s, 55.9 MiB) (+39 % **!**) | 31.91 s (download: 1.70 s, 109.5 MiB) (+18 %) | 50.28 s (download: 2.52 s, 171.6 MiB) (+19 %) | 48.42 s (download: 2.33 s, 165.0 MiB) (+19 %) |
| warm | before | 0.54 s | 0.98 s | 1.55 s | 2.95 s | 5.44 s | 8.51 s | 8.14 s |
| | after | 0.76 s (+40 % **!**) | 1.38 s (+41 % **!**) | 2.17 s (+40 % **!**) | 4.01 s (+36 % **!**) | 7.30 s (+34 %) | 11.83 s (+39 % **!**) | 11.88 s (+46 % **!**) |
| first run after restart | before | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| | after | 1.19 s (+27 %) | 1.81 s (+18 %) | 3.08 s (+40 % **!**) | 5.50 s (+34 %) | 10.27 s (+38 % **!**) | 16.58 s (+41 % **!**) | 15.85 s (+39 % **!**) |
| repeated after restart | before | 0.55 s | 1.08 s | 1.58 s | 2.93 s | 5.50 s | 8.48 s | 8.22 s |
| | after | 0.79 s (+43 % **!**) | 1.23 s (+14 %) | 2.25 s (+43 % **!**) | 4.07 s (+39 % **!**) | 7.29 s (+33 %) | 11.90 s (+40 % **!**) | 11.71 s (+43 % **!**) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.14 s | 0.24 s | 0.42 s | 0.84 s | 1.72 s | 2.75 s | 2.69 s |
| | after | 0.19 s (+36 % **!**) | 0.31 s (+29 %) | 0.56 s (+33 %) | 1.09 s (+30 %) | 2.33 s (+35 % **!**) | 3.73 s (+36 % **!**) | 3.64 s (+35 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| | after | 0.73 s (+44 % **!**) | 1.30 s (+28 %) | 2.18 s (+43 % **!**) | 4.01 s (+38 % **!**) | 7.30 s (+37 % **!**) | 11.84 s (+40 % **!**) | 11.57 s (+42 % **!**) |

### Proof, last 3 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 3 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) of 2026-10-20. **After:** [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 9.48 s (download: 4.68 s, 8.8 MiB) | 8.62 s (download: 2.91 s, 15.6 MiB) | 23.43 s (download: 2.19 s, 28.9 MiB) | 31.57 s (download: 3.07 s, 55.9 MiB) | 60.15 s (download: 7.49 s, 109.5 MiB) | 114.17 s (download: 15.72 s, 171.6 MiB) | 108.75 s (download: 17.59 s, 165.0 MiB) |
| | after | 8.74 s (download: 3.88 s, 8.8 MiB) (-8 %) | 5.55 s (download: 0.84 s, 15.6 MiB) (-36 % **!**) | 25.76 s (download: 3.31 s, 28.9 MiB) (+10 %) | 23.93 s (download: 3.42 s, 55.9 MiB) (-24 %) | 50.68 s (download: 6.55 s, 109.5 MiB) (-16 %) | 81.26 s (download: 10.87 s, 171.6 MiB) (-29 %) | 93.99 s (download: 12.25 s, 165.0 MiB) (-14 %) |
| warm | before | 0.92 s | 1.39 s | 3.34 s | 4.62 s | 5.94 s | 15.95 s | 12.97 s |
| | after | 0.84 s (-9 %) | 1.18 s (-15 %) | 3.47 s (+4 %) | 2.85 s (-38 % **!**) | 6.03 s (+2 %) | 11.44 s (-28 %) | 12.00 s (-8 %) |
| first run after restart | before | 1.50 s | 2.54 s | 7.10 s | 7.18 s | 13.84 s | 27.89 s | 21.02 s |
| | after | 1.47 s | 3.14 s (+23 %) | 5.53 s (-22 %) | 6.00 s (-17 %) | 12.27 s (-11 %) | 21.24 s (-24 %) | 19.75 s (-6 %) |
| repeated after restart | before | 0.82 s | 2.13 s | 4.02 s | 4.29 s | 11.05 s | 17.70 s | 9.56 s |
| | after | 0.66 s (-19 %) | 1.30 s (-39 % **!**) | 3.38 s (-16 %) | 3.48 s (-19 %) | 5.31 s (-52 % **!**) | 10.81 s (-39 % **!**) | 10.71 s (+12 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.28 s | 0.58 s | 1.41 s | 2.14 s | 4.73 s | 9.05 s | 7.56 s |
| | after | 0.34 s (+21 %) | 0.50 s (-14 %) | 1.52 s (+8 %) | 1.97 s (-8 %) | 3.96 s (-16 %) | 7.50 s (-17 %) | 6.35 s (-16 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| | after | 0.62 s (-23 %) | 1.18 s (-21 %) | 3.32 s (-13 %) | 3.23 s (-26 %) | 6.12 s (-10 %) | 11.02 s (-34 %) | 11.32 s (-5 %) |

### Proof, last 3 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 3 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
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
