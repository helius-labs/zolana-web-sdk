# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 9V45 96-Core Processor, 16 GiB, 4 threads, Chrome 155

**Before:** [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) of 2026-10-25. **After:** [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) of 2026-10-25.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 5.87 s (download: 0.35 s, 6.5 MiB) | 10.41 s (download: 0.35 s, 11.6 MiB) | 17.26 s (download: 0.51 s, 21.6 MiB) | 32.83 s (download: 0.86 s, 41.9 MiB) | 64.50 s (download: 1.53 s, 84.2 MiB) | 103.54 s (download: 2.38 s, 138.6 MiB) | 99.56 s (download: 2.31 s, 133.1 MiB) |
| | after | 3.40 s (download: 0.57 s, 6.5 MiB) (-42 % **!**) | 5.24 s (download: 0.32 s, 11.6 MiB) (-50 % **!**) | 9.49 s (download: 0.40 s, 21.6 MiB) (-45 % **!**) | 17.30 s (download: 0.58 s, 41.9 MiB) (-47 % **!**) | 33.37 s (download: 1.05 s, 84.2 MiB) (-48 % **!**) | 53.44 s (download: 1.68 s, 138.6 MiB) (-48 % **!**) | 52.15 s (download: 1.66 s, 133.1 MiB) (-48 % **!**) |
| warm | before | 1.24 s | 1.78 s | 3.23 s | 5.55 s | 10.38 s | 17.27 s | 16.73 s |
| | after | 0.55 s (-56 % **!**) | 1.09 s (-39 % **!**) | 1.58 s (-51 % **!**) | 2.84 s (-49 % **!**) | 5.35 s (-48 % **!**) | 8.90 s (-48 % **!**) | 8.72 s (-48 % **!**) |
| first run after restart | before | 1.48 s | 1.92 s | 3.50 s | 5.93 s | 11.03 s | 18.07 s | 17.52 s |
| | after | 0.64 s (-57 % **!**) | 1.18 s (-38 % **!**) | 1.74 s (-50 % **!**) | 3.05 s (-49 % **!**) | 5.78 s (-48 % **!**) | 9.57 s (-47 % **!**) | 9.15 s (-48 % **!**) |
| repeated after restart | before | 1.36 s | 1.78 s | 3.13 s | 5.54 s | 10.40 s | 17.01 s | 16.61 s |
| | after | 0.53 s (-61 % **!**) | 1.07 s (-40 % **!**) | 1.60 s (-49 % **!**) | 2.85 s (-49 % **!**) | 5.35 s (-49 % **!**) | 9.07 s (-47 % **!**) | 8.61 s (-48 % **!**) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.04 s | 0.05 s | 0.11 s | 0.16 s | 0.30 s | 0.47 s | 0.45 s |
| | after | 0.02 s | 0.04 s | 0.05 s (-55 % **!**) | 0.08 s (-50 % **!**) | 0.15 s (-50 % **!**) | 0.23 s (-51 % **!**) | 0.22 s (-51 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 1.29 s | 1.73 s | 3.11 s | 5.50 s | 10.35 s | 17.16 s | 16.60 s |
| | after | 0.51 s (-61 % **!**) | 1.03 s (-41 % **!**) | 1.56 s (-50 % **!**) | 2.82 s (-49 % **!**) | 5.35 s (-48 % **!**) | 8.92 s (-48 % **!**) | 8.66 s (-48 % **!**) |

### Proof, last 19 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) | 2026-10-25 | 0.51 s | 1.03 s | 1.56 s | 2.82 s | 5.35 s | 8.92 s | 8.66 s |
| [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) | 2026-10-25 | 1.29 s | 1.73 s | 3.11 s | 5.50 s | 10.35 s | 17.16 s | 16.60 s |
| [`3762798`](https://github.com/helius-labs/zolana-web-sdk/commit/3762798d6dd55700f8c64de09da9bde991d6b970) | 2026-10-25 | 0.88 s | 1.17 s | 2.09 s | 3.73 s | 7.02 s | 11.39 s | 11.05 s |
| [`a819d8b`](https://github.com/helius-labs/zolana-web-sdk/commit/a819d8b51327cfc08cfe336ea9057b9e7f387bb4) | 2026-10-25 | 0.52 s | 1.08 s | 1.56 s | 2.83 s | 5.46 s | 8.79 s | 8.38 s |
| [`a406059`](https://github.com/helius-labs/zolana-web-sdk/commit/a40605927bda90e78453df6bafc7f9b222743f89) | 2026-10-25 | 0.62 s | 0.92 s | 1.62 s | 2.88 s | 5.60 s | 9.16 s | 8.67 s |
| [`1a85579`](https://github.com/helius-labs/zolana-web-sdk/commit/1a85579e17ce668545ba6e0cbafb50aa21eba8d9) | 2026-10-23 | 0.53 s | 1.17 s | 1.65 s | 2.95 s | 5.37 s | 8.87 s | 8.48 s |
| [`1f24d21`](https://github.com/helius-labs/zolana-web-sdk/commit/1f24d212a540b687bc63799c8968fb5e8bf553a6) | 2026-10-23 | 0.70 s | 1.18 s | 2.11 s | 3.75 s | 7.08 s | 11.41 s | 11.11 s |
| [`6a6a0ee`](https://github.com/helius-labs/zolana-web-sdk/commit/6a6a0eeef8d35a743c29c98d5f8e8873e08f6674) | 2026-10-23 | 1.14 s | 1.60 s | 2.90 s | 5.09 s | 9.51 s | 15.27 s | 14.98 s |
| [`1efa1b3`](https://github.com/helius-labs/zolana-web-sdk/commit/1efa1b383a150debacecead29fb8047a34bcf1f4) | 2026-10-20 | 0.83 s | 1.23 s | 2.13 s | 4.02 s | 7.25 s | 11.71 s | 11.37 s |
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

### First run after a restart, last 19 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) | 2026-10-25 | 0.64 s | 1.18 s | 1.74 s | 3.05 s | 5.78 s | 9.57 s | 9.15 s |
| [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) | 2026-10-25 | 1.48 s | 1.92 s | 3.50 s | 5.93 s | 11.03 s | 18.07 s | 17.52 s |
| [`3762798`](https://github.com/helius-labs/zolana-web-sdk/commit/3762798d6dd55700f8c64de09da9bde991d6b970) | 2026-10-25 | 1.01 s | 1.33 s | 2.31 s | 4.03 s | 7.42 s | 11.96 s | 11.66 s |
| [`a819d8b`](https://github.com/helius-labs/zolana-web-sdk/commit/a819d8b51327cfc08cfe336ea9057b9e7f387bb4) | 2026-10-25 | 0.67 s | 1.26 s | 1.73 s | 3.20 s | 5.85 s | 9.31 s | 8.89 s |
| [`a406059`](https://github.com/helius-labs/zolana-web-sdk/commit/a40605927bda90e78453df6bafc7f9b222743f89) | 2026-10-25 | 0.82 s | 1.04 s | 1.81 s | 3.13 s | 5.96 s | 9.79 s | 9.19 s |
| [`1a85579`](https://github.com/helius-labs/zolana-web-sdk/commit/1a85579e17ce668545ba6e0cbafb50aa21eba8d9) | 2026-10-23 | 0.66 s | 1.35 s | 1.83 s | 3.16 s | 5.74 s | 9.60 s | 8.93 s |
| [`1f24d21`](https://github.com/helius-labs/zolana-web-sdk/commit/1f24d212a540b687bc63799c8968fb5e8bf553a6) | 2026-10-23 | 0.90 s | 1.33 s | 2.34 s | 3.99 s | 7.56 s | 11.94 s | 11.78 s |
| [`6a6a0ee`](https://github.com/helius-labs/zolana-web-sdk/commit/6a6a0eeef8d35a743c29c98d5f8e8873e08f6674) | 2026-10-23 | 1.33 s | 1.82 s | 3.13 s | 5.44 s | 10.07 s | 16.15 s | 15.76 s |
| [`1efa1b3`](https://github.com/helius-labs/zolana-web-sdk/commit/1efa1b383a150debacecead29fb8047a34bcf1f4) | 2026-10-20 | 1.68 s | 1.88 s | 3.11 s | 5.56 s | 10.09 s | 16.11 s | 15.66 s |
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

**Before:** [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) of 2026-10-25. **After:** [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) of 2026-10-25.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 11.85 s (download: 2.94 s, 6.5 MiB) | 8.94 s (download: 0.70 s, 11.6 MiB) | 18.14 s (download: 1.05 s, 21.6 MiB) | 31.81 s (download: 6.42 s, 41.9 MiB) | 66.20 s (download: 10.49 s, 84.2 MiB) | 107.69 s (download: 22.94 s, 138.6 MiB) | 87.54 s (download: 14.05 s, 133.1 MiB) |
| | after | 20.54 s (download: 6.09 s, 6.5 MiB) (+73 % **!**) | 24.96 s (download: 10.27 s, 11.6 MiB) (+179 % **!**) | 30.18 s (download: 9.30 s, 21.6 MiB) (+66 % **!**) | 40.09 s (download: 10.14 s, 41.9 MiB) (+26 %) | 83.32 s (download: 16.68 s, 84.2 MiB) (+26 %) | 116.02 s (download: 20.45 s, 138.6 MiB) (+8 %) | 111.68 s (download: 18.24 s, 133.1 MiB) (+28 %) |
| warm | before | 0.30 s | 0.41 s | 0.63 s | 0.93 s | 1.74 s | 4.48 s | 2.74 s |
| | after | 0.45 s (+49 % **!**) | 0.53 s (+32 %) | 0.73 s (+17 %) | 1.00 s (+8 %) | 1.78 s | 4.71 s (+5 %) | 3.45 s (+26 %) |
| first run after restart | before | 7.55 s | 7.74 s | 7.16 s | 8.23 s | 15.15 s | 16.77 s | 10.03 s |
| | after | 12.70 s (+68 % **!**) | 10.40 s (+34 %) | 9.30 s (+30 %) | 10.75 s (+31 %) | 15.14 s | 20.35 s (+21 %) | 17.70 s (+76 % **!**) |
| repeated after restart | before | 0.30 s | 0.38 s | 0.63 s | 0.96 s | 2.06 s | 3.30 s | 2.41 s |
| | after | 0.31 s | 0.43 s (+13 %) | 0.68 s | 1.02 s (+6 %) | 2.07 s | 2.88 s (-13 %) | 4.39 s (+82 % **!**) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.06 s | 0.08 s | 0.12 s | 0.27 s | 0.95 s | 1.56 s | 1.45 s |
| | after | 0.11 s (+83 % **!**) | 0.14 s (+75 % **!**) | 0.20 s (+67 % **!**) | 0.30 s | 1.16 s (+22 %) | 1.52 s | 1.27 s (-12 %) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.24 s | 0.35 s | 0.59 s | 0.90 s | 1.81 s | 3.81 s | 2.57 s |
| | after | 0.33 s (+35 %) | 0.43 s (+24 %) | 0.65 s (+9 %) | 0.96 s (+7 %) | 2.44 s (+35 %) | 3.24 s (-15 %) | 4.06 s (+58 % **!**) |

### Proof, last 19 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) | 2026-10-25 | 0.33 s | 0.43 s | 0.65 s | 0.96 s | 2.44 s | 3.24 s | 4.06 s |
| [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) | 2026-10-25 | 0.24 s | 0.35 s | 0.59 s | 0.90 s | 1.81 s | 3.81 s | 2.57 s |
| [`3762798`](https://github.com/helius-labs/zolana-web-sdk/commit/3762798d6dd55700f8c64de09da9bde991d6b970) | 2026-10-25 | 0.36 s | 0.38 s | 0.64 s | 0.97 s | 1.96 s | 2.76 s | 5.94 s |
| [`a819d8b`](https://github.com/helius-labs/zolana-web-sdk/commit/a819d8b51327cfc08cfe336ea9057b9e7f387bb4) | 2026-10-25 | 0.25 s | 0.34 s | 0.64 s | 0.93 s | 1.63 s | 2.60 s | 2.62 s |
| [`a406059`](https://github.com/helius-labs/zolana-web-sdk/commit/a40605927bda90e78453df6bafc7f9b222743f89) | 2026-10-25 | 0.37 s | 0.57 s | 0.65 s | 0.94 s | 1.76 s | 2.67 s | 3.33 s |
| [`1a85579`](https://github.com/helius-labs/zolana-web-sdk/commit/1a85579e17ce668545ba6e0cbafb50aa21eba8d9) | 2026-10-23 | 0.34 s | 0.46 s | 0.76 s | 1.06 s | 3.63 s | 4.52 s | 5.03 s |
| [`1f24d21`](https://github.com/helius-labs/zolana-web-sdk/commit/1f24d212a540b687bc63799c8968fb5e8bf553a6) | 2026-10-23 | 0.26 s | 0.41 s | 0.64 s | 0.92 s | 1.64 s | 3.81 s | 2.54 s |
| [`6a6a0ee`](https://github.com/helius-labs/zolana-web-sdk/commit/6a6a0eeef8d35a743c29c98d5f8e8873e08f6674) | 2026-10-23 | 0.44 s | 0.38 s | 0.65 s | 0.96 s | 1.80 s | 3.31 s | 3.19 s |
| [`1efa1b3`](https://github.com/helius-labs/zolana-web-sdk/commit/1efa1b383a150debacecead29fb8047a34bcf1f4) | 2026-10-20 | 0.56 s | 0.86 s | 2.40 s | 3.60 s | 6.94 s | 10.72 s | 9.29 s |
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

### First run after a restart, last 19 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`ce50ff4`](https://github.com/helius-labs/zolana-web-sdk/commit/ce50ff499e6f8d680c2277e79ca5cd7c3b9c8da8) | 2026-10-25 | 12.70 s | 10.40 s | 9.30 s | 10.75 s | 15.14 s | 20.35 s | 17.70 s |
| [`5347fc5`](https://github.com/helius-labs/zolana-web-sdk/commit/5347fc56552c3755c8ce78423ae879c398eb37c4) | 2026-10-25 | 7.55 s | 7.74 s | 7.16 s | 8.23 s | 15.15 s | 16.77 s | 10.03 s |
| [`3762798`](https://github.com/helius-labs/zolana-web-sdk/commit/3762798d6dd55700f8c64de09da9bde991d6b970) | 2026-10-25 | 11.49 s | 10.44 s | 9.26 s | 10.38 s | 12.13 s | 12.58 s | 24.86 s |
| [`a819d8b`](https://github.com/helius-labs/zolana-web-sdk/commit/a819d8b51327cfc08cfe336ea9057b9e7f387bb4) | 2026-10-25 | 9.46 s | 8.42 s | 7.50 s | 10.07 s | 9.23 s | 9.69 s | 8.91 s |
| [`a406059`](https://github.com/helius-labs/zolana-web-sdk/commit/a40605927bda90e78453df6bafc7f9b222743f89) | 2026-10-25 | 9.78 s | 9.94 s | 11.59 s | 12.61 s | 9.10 s | 10.57 s | 9.96 s |
| [`1a85579`](https://github.com/helius-labs/zolana-web-sdk/commit/1a85579e17ce668545ba6e0cbafb50aa21eba8d9) | 2026-10-23 | 14.83 s | 14.49 s | 14.51 s | 15.56 s | 20.72 s | 20.95 s | 25.80 s |
| [`1f24d21`](https://github.com/helius-labs/zolana-web-sdk/commit/1f24d212a540b687bc63799c8968fb5e8bf553a6) | 2026-10-23 | 11.04 s | 10.57 s | 9.14 s | 11.59 s | 9.13 s | 18.16 s | 11.49 s |
| [`6a6a0ee`](https://github.com/helius-labs/zolana-web-sdk/commit/6a6a0eeef8d35a743c29c98d5f8e8873e08f6674) | 2026-10-23 | 9.01 s | 8.07 s | 8.23 s | 8.66 s | 12.52 s | 18.98 s | 14.33 s |
| [`1efa1b3`](https://github.com/helius-labs/zolana-web-sdk/commit/1efa1b383a150debacecead29fb8047a34bcf1f4) | 2026-10-20 | 1.85 s | 2.25 s | 5.32 s | 6.79 s | 12.30 s | 18.82 s | 16.65 s |
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
