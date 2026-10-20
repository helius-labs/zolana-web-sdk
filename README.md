# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 9V45 96-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) of 2026-10-17. **After:** [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 3.16 s (download: 1.06 s, 8.8 MiB) | 3.80 s (download: 0.43 s, 15.6 MiB) | 6.55 s (download: 0.55 s, 28.9 MiB) | 12.10 s (download: 0.82 s, 55.9 MiB) | 23.61 s (download: 1.84 s, 109.5 MiB) | 37.46 s (download: 2.44 s, 171.6 MiB) | 35.53 s (download: 2.24 s, 165.0 MiB) |
| | after | 2.95 s (download: 0.93 s, 8.8 MiB) (-7 %) | 3.89 s (download: 0.46 s, 15.6 MiB) (+2 %) | 6.94 s (download: 0.59 s, 28.9 MiB) (+6 %) | 11.94 s (download: 0.78 s, 55.9 MiB) (-1 %) | 26.98 s (download: 5.53 s, 109.5 MiB) (+14 %) | 42.25 s (download: 7.78 s, 171.6 MiB) (+13 %) | 40.75 s (download: 7.75 s, 165.0 MiB) (+15 %) |
| warm | before | 0.58 s | 1.15 s | 1.65 s | 3.04 s | 5.32 s | 8.70 s | 8.35 s |
| | after | 0.54 s | 0.98 s (-15 %) | 1.55 s (-6 %) | 2.95 s (-3 %) | 5.44 s (+2 %) | 8.51 s (-2 %) | 8.14 s (-3 %) |
| first run after restart | before | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |
| | after | 0.94 s | 1.53 s (-9 %) | 2.20 s (-9 %) | 4.11 s (-6 %) | 7.46 s (-1 %) | 11.76 s (-3 %) | 11.40 s (-2 %) |
| repeated after restart | before | 0.62 s | 1.18 s | 1.64 s | 3.00 s | 5.39 s | 8.70 s | 8.52 s |
| | after | 0.55 s (-11 %) | 1.08 s (-9 %) | 1.58 s (-4 %) | 2.93 s (-2 %) | 5.50 s (+2 %) | 8.48 s (-2 %) | 8.22 s (-4 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.15 s | 0.27 s | 0.54 s | 0.90 s | 1.78 s | 2.86 s | 2.78 s |
| | after | 0.14 s | 0.24 s | 0.42 s (-22 %) | 0.84 s (-7 %) | 1.72 s (-3 %) | 2.75 s (-4 %) | 2.69 s (-3 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |
| | after | 0.51 s | 1.01 s (-9 %) | 1.52 s (-5 %) | 2.90 s (-2 %) | 5.35 s | 8.46 s (-2 %) | 8.17 s (-1 %) |

### Proof, last 2 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 2 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) of 2026-10-17. **After:** [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 8.34 s (download: 3.82 s, 8.8 MiB) | 7.87 s (download: 0.99 s, 15.6 MiB) | 12.01 s (download: 1.39 s, 28.9 MiB) | 40.35 s (download: 3.65 s, 55.9 MiB) | 55.32 s (download: 7.94 s, 109.5 MiB) | 100.10 s (download: 11.28 s, 171.6 MiB) | 84.44 s (download: 8.87 s, 165.0 MiB) |
| | after | 9.48 s (download: 4.68 s, 8.8 MiB) (+14 %) | 8.62 s (download: 2.91 s, 15.6 MiB) (+10 %) | 23.43 s (download: 2.19 s, 28.9 MiB) (+95 % **!**) | 31.57 s (download: 3.07 s, 55.9 MiB) (-22 %) | 60.15 s (download: 7.49 s, 109.5 MiB) (+9 %) | 114.17 s (download: 15.72 s, 171.6 MiB) (+14 %) | 108.75 s (download: 17.59 s, 165.0 MiB) (+29 %) |
| warm | before | 0.73 s | 1.42 s | 1.95 s | 6.16 s | 7.98 s | 12.14 s | 11.27 s |
| | after | 0.92 s (+26 %) | 1.39 s | 3.34 s (+71 % **!**) | 4.62 s (-25 %) | 5.94 s (-26 %) | 15.95 s (+31 %) | 12.97 s (+15 %) |
| first run after restart | before | 1.74 s | 2.44 s | 4.82 s | 7.75 s | 16.21 s | 21.20 s | 19.76 s |
| | after | 1.50 s (-13 %) | 2.54 s (+4 %) | 7.10 s (+47 % **!**) | 7.18 s (-7 %) | 13.84 s (-15 %) | 27.89 s (+32 %) | 21.02 s (+6 %) |
| repeated after restart | before | 1.05 s | 1.13 s | 2.36 s | 4.40 s | 5.60 s | 10.92 s | 11.58 s |
| | after | 0.82 s (-22 %) | 2.13 s (+89 % **!**) | 4.02 s (+70 % **!**) | 4.29 s (-2 %) | 11.05 s (+97 % **!**) | 17.70 s (+62 % **!**) | 9.56 s (-17 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.43 s | 0.67 s | 1.41 s | 2.17 s | 6.36 s | 6.02 s | 7.11 s |
| | after | 0.28 s (-35 %) | 0.58 s (-13 %) | 1.41 s | 2.14 s | 4.73 s (-26 %) | 9.05 s (+50 % **!**) | 7.56 s (+6 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |
| | after | 0.81 s | 1.49 s (+28 %) | 3.84 s (+94 % **!**) | 4.38 s (-4 %) | 6.77 s (-11 %) | 16.71 s (+41 % **!**) | 11.86 s (+5 %) |

### Proof, last 2 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 2 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
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
