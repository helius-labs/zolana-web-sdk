# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 7763 64-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) of 2026-10-20. **After:** [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 4.95 s (download: 1.37 s, 8.8 MiB) | 7.75 s (download: 0.77 s, 15.6 MiB) | 11.48 s (download: 0.90 s, 28.9 MiB) | 21.75 s (download: 1.50 s, 55.9 MiB) | 41.87 s (download: 2.73 s, 109.5 MiB) | 66.19 s (download: 3.95 s, 171.6 MiB) | 63.35 s (download: 3.63 s, 165.0 MiB) |
| | after | 5.21 s (download: 1.31 s, 8.8 MiB) (+5 %) | 7.87 s (download: 0.86 s, 15.6 MiB) (+1 %) | 12.71 s (download: 1.24 s, 28.9 MiB) (+11 %) | 23.88 s (download: 1.98 s, 55.9 MiB) (+10 %) | 45.83 s (download: 3.45 s, 109.5 MiB) (+9 %) | 73.28 s (download: 5.25 s, 171.6 MiB) (+11 %) | 71.08 s (download: 5.11 s, 165.0 MiB) (+12 %) |
| warm | before | 0.98 s | 1.91 s | 2.79 s | 5.11 s | 9.24 s | 14.92 s | 14.48 s |
| | after | 1.20 s (+22 %) | 1.61 s (-16 %) | 2.86 s (+2 %) | 5.22 s (+2 %) | 9.61 s (+4 %) | 15.54 s (+4 %) | 15.15 s (+5 %) |
| first run after restart | before | 1.77 s | 2.31 s | 3.82 s | 6.80 s | 12.38 s | 19.67 s | 19.17 s |
| | after | 2.05 s (+16 %) | 2.56 s (+11 %) | 4.18 s (+9 %) | 7.61 s (+12 %) | 13.84 s (+12 %) | 22.47 s (+14 %) | 21.77 s (+14 %) |
| repeated after restart | before | 0.97 s | 1.60 s | 2.85 s | 5.11 s | 9.29 s | 14.83 s | 14.48 s |
| | after | 1.29 s (+32 %) | 1.65 s | 2.87 s | 5.33 s (+4 %) | 9.69 s (+4 %) | 15.54 s (+5 %) | 15.22 s (+5 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.28 s | 0.40 s | 0.70 s | 1.31 s | 2.60 s | 4.28 s | 4.19 s |
| | after | 0.29 s | 0.50 s (+25 %) | 0.89 s (+27 %) | 1.75 s (+34 %) | 3.53 s (+36 % **!**) | 6.23 s (+46 % **!**) | 5.91 s (+41 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.92 s | 1.58 s | 2.75 s | 5.06 s | 9.25 s | 14.78 s | 14.40 s |
| | after | 1.15 s (+25 %) | 1.59 s | 2.81 s (+3 %) | 5.26 s (+4 %) | 9.57 s (+3 %) | 15.46 s (+5 %) | 15.11 s (+5 %) |

### Proof, last 10 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) | 2026-10-20 | 1.15 s | 1.59 s | 2.81 s | 5.26 s | 9.57 s | 15.46 s | 15.11 s |
| [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) | 2026-10-20 | 0.92 s | 1.58 s | 2.75 s | 5.06 s | 9.25 s | 14.78 s | 14.40 s |
| [`3d069e9`](https://github.com/helius-labs/zolana-web-sdk/commit/3d069e9889d0512b9cc4263a4024ea7974b3233d) | 2026-10-20 | 1.21 s | 1.65 s | 2.92 s | 5.36 s | 9.70 s | 15.80 s | 15.37 s |
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 0.70 s | 1.38 s | 2.10 s | 3.92 s | 7.17 s | 11.78 s | 11.31 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.97 s | 1.84 s | 2.91 s | 5.35 s | 9.77 s | 15.64 s | 15.22 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.13 s | 1.63 s | 2.93 s | 5.45 s | 9.78 s | 15.90 s | 14.99 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 1.23 s | 1.64 s | 2.91 s | 5.33 s | 9.72 s | 15.46 s | 15.10 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.73 s | 1.30 s | 2.18 s | 4.01 s | 7.30 s | 11.84 s | 11.57 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.51 s | 1.01 s | 1.52 s | 2.90 s | 5.35 s | 8.46 s | 8.17 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.54 s | 1.12 s | 1.60 s | 2.98 s | 5.35 s | 8.65 s | 8.29 s |

### First run after a restart, last 10 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) | 2026-10-20 | 2.05 s | 2.56 s | 4.18 s | 7.61 s | 13.84 s | 22.47 s | 21.77 s |
| [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) | 2026-10-20 | 1.77 s | 2.31 s | 3.82 s | 6.80 s | 12.38 s | 19.67 s | 19.17 s |
| [`3d069e9`](https://github.com/helius-labs/zolana-web-sdk/commit/3d069e9889d0512b9cc4263a4024ea7974b3233d) | 2026-10-20 | 1.92 s | 2.51 s | 4.25 s | 7.29 s | 13.05 s | 21.43 s | 20.80 s |
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 1.31 s | 2.03 s | 3.20 s | 5.81 s | 10.83 s | 17.81 s | 17.02 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 1.70 s | 2.54 s | 4.27 s | 7.30 s | 13.23 s | 21.07 s | 20.46 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 1.97 s | 2.48 s | 4.13 s | 7.53 s | 13.45 s | 20.98 s | 19.87 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 2.15 s | 2.50 s | 4.20 s | 7.20 s | 13.03 s | 20.59 s | 20.02 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 1.19 s | 1.81 s | 3.08 s | 5.50 s | 10.27 s | 16.58 s | 15.85 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.94 s | 1.53 s | 2.20 s | 4.11 s | 7.46 s | 11.76 s | 11.40 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.92 s | 1.69 s | 2.40 s | 4.39 s | 7.57 s | 12.10 s | 11.58 s |

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) of 2026-10-20. **After:** [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) of 2026-10-20.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 7.90 s (download: 3.19 s, 8.8 MiB) | 9.81 s (download: 1.76 s, 15.6 MiB) | 22.96 s (download: 1.80 s, 28.9 MiB) | 27.72 s (download: 3.03 s, 55.9 MiB) | 69.99 s (download: 8.01 s, 109.5 MiB) | 102.42 s (download: 18.66 s, 171.6 MiB) | 104.61 s (download: 17.73 s, 165.0 MiB) |
| | after | 4.30 s (download: 1.48 s, 8.8 MiB) (-46 % **!**) | 7.26 s (download: 2.54 s, 15.6 MiB) (-26 %) | 11.41 s (download: 1.25 s, 28.9 MiB) (-50 % **!**) | 21.08 s (download: 1.93 s, 55.9 MiB) (-24 %) | 36.24 s (download: 4.80 s, 109.5 MiB) (-48 % **!**) | 56.20 s (download: 6.58 s, 171.6 MiB) (-45 % **!**) | 54.16 s (download: 7.01 s, 165.0 MiB) (-48 % **!**) |
| warm | before | 1.08 s | 3.03 s | 3.44 s | 4.56 s | 8.47 s | 13.65 s | 11.77 s |
| | after | 0.51 s (-53 % **!**) | 0.78 s (-74 % **!**) | 1.87 s (-46 % **!**) | 2.47 s (-46 % **!**) | 4.41 s (-48 % **!**) | 6.94 s (-49 % **!**) | 6.94 s (-41 % **!**) |
| first run after restart | before | 1.81 s | 3.55 s | 5.93 s | 8.08 s | 16.46 s | 27.92 s | 24.51 s |
| | after | 0.93 s (-49 % **!**) | 1.56 s (-56 % **!**) | 2.75 s (-54 % **!**) | 4.37 s (-46 % **!**) | 7.20 s (-56 % **!**) | 13.10 s (-53 % **!**) | 12.34 s (-50 % **!**) |
| repeated after restart | before | 0.71 s | 1.93 s | 2.39 s | 4.48 s | 8.95 s | 14.78 s | 13.14 s |
| | after | 0.48 s (-32 %) | 0.99 s (-49 % **!**) | 1.94 s (-19 %) | 2.42 s (-46 % **!**) | 4.51 s (-50 % **!**) | 7.06 s (-52 % **!**) | 7.00 s (-47 % **!**) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.40 s | 0.78 s | 1.29 s | 2.43 s | 5.59 s | 11.61 s | 8.90 s |
| | after | 0.17 s (-57 % **!**) | 0.31 s (-60 % **!**) | 0.54 s (-58 % **!**) | 1.31 s (-46 % **!**) | 2.35 s (-58 % **!**) | 3.80 s (-67 % **!**) | 3.69 s (-59 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.79 s | 2.06 s | 3.26 s | 4.42 s | 9.01 s | 13.72 s | 12.90 s |
| | after | 0.44 s (-44 % **!**) | 0.79 s (-62 % **!**) | 1.83 s (-44 % **!**) | 2.42 s (-45 % **!**) | 4.42 s (-51 % **!**) | 6.95 s (-49 % **!**) | 7.10 s (-45 % **!**) |

### Proof, last 10 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) | 2026-10-20 | 0.44 s | 0.79 s | 1.83 s | 2.42 s | 4.42 s | 6.95 s | 7.10 s |
| [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) | 2026-10-20 | 0.79 s | 2.06 s | 3.26 s | 4.42 s | 9.01 s | 13.72 s | 12.90 s |
| [`3d069e9`](https://github.com/helius-labs/zolana-web-sdk/commit/3d069e9889d0512b9cc4263a4024ea7974b3233d) | 2026-10-20 | 0.52 s | 1.08 s | 2.51 s | 2.82 s | 5.50 s | 10.09 s | 9.13 s |
| [`af6663a`](https://github.com/helius-labs/zolana-web-sdk/commit/af6663ad98baad074036a26ad8788d2395c17485) | 2026-10-20 | 0.60 s | 1.04 s | 2.66 s | 2.82 s | 5.11 s | 14.85 s | 11.76 s |
| [`dbc942a`](https://github.com/helius-labs/zolana-web-sdk/commit/dbc942a9a8d2cee4db2f6babc7cc9a40dc68e153) | 2026-10-20 | 0.70 s | 1.42 s | 3.78 s | 3.79 s | 7.82 s | 14.45 s | 14.96 s |
| [`7a2956b`](https://github.com/helius-labs/zolana-web-sdk/commit/7a2956b7bc3410ba95b674709200e0f01142b74a) | 2026-10-20 | 0.79 s | 1.72 s | 3.03 s | 3.85 s | 6.97 s | 11.52 s | 11.26 s |
| [`a24f1c8`](https://github.com/helius-labs/zolana-web-sdk/commit/a24f1c82875c1eae87e17cef411bb7fffefe3026) | 2026-10-20 | 0.58 s | 1.46 s | 3.00 s | 3.33 s | 7.48 s | 12.05 s | 11.54 s |
| [`c5f6c29`](https://github.com/helius-labs/zolana-web-sdk/commit/c5f6c2949560dcbc9af870438abf4fc2488f0c44) | 2026-10-20 | 0.62 s | 1.18 s | 3.32 s | 3.23 s | 6.12 s | 11.02 s | 11.32 s |
| [`08c5178`](https://github.com/helius-labs/zolana-web-sdk/commit/08c5178008358a0ac36ee0641f9f48f6129adffc) | 2026-10-20 | 0.81 s | 1.49 s | 3.84 s | 4.38 s | 6.77 s | 16.71 s | 11.86 s |
| [`25b694a`](https://github.com/helius-labs/zolana-web-sdk/commit/25b694a92a2c3250724e95ec405bc86bc05bfa83) | 2026-10-17 | 0.77 s | 1.17 s | 1.98 s | 4.55 s | 7.63 s | 11.87 s | 11.33 s |

### First run after a restart, last 10 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`48cb1ed`](https://github.com/helius-labs/zolana-web-sdk/commit/48cb1ed62d90bd951f07e35f7616d5c01c0599f9) | 2026-10-20 | 0.93 s | 1.56 s | 2.75 s | 4.37 s | 7.20 s | 13.10 s | 12.34 s |
| [`298ba63`](https://github.com/helius-labs/zolana-web-sdk/commit/298ba63e54bfdf76886d25ea574ff0ab9abaad6c) | 2026-10-20 | 1.81 s | 3.55 s | 5.93 s | 8.08 s | 16.46 s | 27.92 s | 24.51 s |
| [`3d069e9`](https://github.com/helius-labs/zolana-web-sdk/commit/3d069e9889d0512b9cc4263a4024ea7974b3233d) | 2026-10-20 | 1.04 s | 1.97 s | 4.41 s | 4.74 s | 9.73 s | 17.70 s | 15.90 s |
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
