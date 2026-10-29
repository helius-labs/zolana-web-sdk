# Proof timing on main

Written by CI after every push to `main` (`scripts/proof-timing-history.mjs` on `main`), from headless Chrome on each CI runner. Runner numbers compare commits, not laptops: up to about 30 % between two commits can be the runner. The data is in `history/`, a line per commit.

## Linux x64, AMD EPYC 7763 64-Core Processor, 16 GiB, 4 threads, Chrome 156

**Before:** [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) of 2026-10-29. **After:** [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) of 2026-10-29.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 7.29 s (download: 1.87 s, 6.5 MiB) | 12.12 s (download: 0.67 s, 11.6 MiB) | 20.80 s (download: 3.76 s, 21.6 MiB) | 36.63 s (download: 4.45 s, 41.9 MiB) | 71.13 s (download: 7.45 s, 84.2 MiB) | 104.83 s (download: 5.81 s, 138.6 MiB) | 106.52 s (download: 10.21 s, 133.1 MiB) |
| | after | 6.02 s (download: 0.63 s, 6.5 MiB) (-17 %) | 11.81 s (download: 0.44 s, 11.6 MiB) (-3 %) | 17.52 s (download: 0.63 s, 21.6 MiB) (-16 %) | 33.34 s (download: 1.19 s, 41.9 MiB) (-9 %) | 64.75 s (download: 1.92 s, 84.2 MiB) (-9 %) | 102.57 s (download: 2.91 s, 138.6 MiB) (-2 %) | 98.07 s (download: 2.74 s, 133.1 MiB) (-8 %) |
| warm | before | 1.08 s | 1.76 s | 2.89 s | 5.05 s | 9.42 s | 15.02 s | 14.74 s |
| | after | 0.97 s (-11 %) | 1.77 s | 2.92 s | 5.03 s | 9.32 s (-1 %) | 14.98 s | 14.53 s (-1 %) |
| first run after restart | before | 1.16 s | 1.82 s | 3.30 s | 5.51 s | 10.03 s | 16.29 s | 15.91 s |
| | after | 1.29 s (+11 %) | 1.77 s (-3 %) | 3.31 s | 5.54 s | 10.09 s (+1 %) | 16.12 s (-1 %) | 15.78 s (-1 %) |
| repeated after restart | before | 1.01 s | 1.61 s | 2.86 s | 5.04 s | 9.23 s | 15.10 s | 14.67 s |
| | after | 0.99 s | 1.60 s | 2.89 s | 5.00 s | 9.28 s | 14.80 s (-2 %) | 14.62 s (-0 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.04 s | 0.07 s | 0.13 s | 0.22 s | 0.43 s | 0.67 s | 0.65 s |
| | after | 0.05 s | 0.07 s | 0.12 s | 0.23 s | 0.43 s | 0.67 s | 0.64 s |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.95 s | 1.57 s | 2.84 s | 5.00 s | 9.27 s | 14.98 s | 14.64 s |
| | after | 0.94 s | 1.57 s | 2.86 s | 4.96 s | 9.25 s | 14.88 s (-1 %) | 14.52 s (-1 %) |

### Proof, last 20 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) | 2026-10-29 | 0.94 s | 1.57 s | 2.86 s | 4.96 s | 9.25 s | 14.88 s | 14.52 s |
| [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) | 2026-10-29 | 0.95 s | 1.57 s | 2.84 s | 5.00 s | 9.27 s | 14.98 s | 14.64 s |
| [`ec81dbd`](https://github.com/helius-labs/zolana-web-sdk/commit/ec81dbd3e00b6683b91e37f10f10d152307f32a0) | 2026-10-29 | 1.30 s | 1.72 s | 3.05 s | 5.47 s | 10.34 s | 16.48 s | 15.97 s |
| [`ded898d`](https://github.com/helius-labs/zolana-web-sdk/commit/ded898dd414788780bf0b5479016cfd1535d31e8) | 2026-10-27 | 1.05 s | 1.59 s | 2.90 s | 5.02 s | 9.36 s | 15.12 s | 14.79 s |
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

### First run after a restart, last 20 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) | 2026-10-29 | 1.29 s | 1.77 s | 3.31 s | 5.54 s | 10.09 s | 16.12 s | 15.78 s |
| [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) | 2026-10-29 | 1.16 s | 1.82 s | 3.30 s | 5.51 s | 10.03 s | 16.29 s | 15.91 s |
| [`ec81dbd`](https://github.com/helius-labs/zolana-web-sdk/commit/ec81dbd3e00b6683b91e37f10f10d152307f32a0) | 2026-10-29 | 1.73 s | 1.95 s | 3.48 s | 6.04 s | 11.10 s | 17.59 s | 17.20 s |
| [`ded898d`](https://github.com/helius-labs/zolana-web-sdk/commit/ded898dd414788780bf0b5479016cfd1535d31e8) | 2026-10-27 | 1.26 s | 1.79 s | 3.13 s | 5.42 s | 9.92 s | 15.92 s | 15.55 s |
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

## macOS arm64, Apple M1 (Virtual), 7 GiB, 3 threads, Chrome 155

**Before:** [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) of 2026-10-29. **After:** [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) of 2026-10-29.

| by scenario | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| first run, including download | before | 14.45 s (download: 4.46 s, 6.5 MiB) | 18.33 s (download: 8.56 s, 11.6 MiB) | 23.01 s (download: 8.25 s, 21.6 MiB) | 34.62 s (download: 8.47 s, 41.9 MiB) | 63.51 s (download: 9.88 s, 84.2 MiB) | 117.67 s (download: 20.46 s, 138.6 MiB) | 109.31 s (download: 17.84 s, 133.1 MiB) |
| | after | 17.30 s (download: 4.68 s, 6.5 MiB) (+20 %) | 27.79 s (download: 11.73 s, 11.6 MiB) (+52 % **!**) | 30.02 s (download: 11.02 s, 21.6 MiB) (+30 %) | 46.58 s (download: 13.22 s, 41.9 MiB) (+35 %) | 88.91 s (download: 18.08 s, 84.2 MiB) (+40 % **!**) | 137.47 s (download: 27.15 s, 138.6 MiB) (+17 %) | 131.67 s (download: 25.65 s, 133.1 MiB) (+20 %) |
| warm | before | 0.51 s | 0.43 s | 0.66 s | 1.02 s | 1.85 s | 3.25 s | 3.33 s |
| | after | 0.41 s (-20 %) | 0.49 s (+16 %) | 0.73 s (+12 %) | 1.13 s (+11 %) | 1.94 s (+5 %) | 5.72 s (+76 % **!**) | 3.63 s (+9 %) |
| first run after restart | before | 9.01 s | 10.82 s | 8.07 s | 8.90 s | 12.32 s | 19.33 s | 14.96 s |
| | after | 12.79 s (+42 % **!**) | 12.49 s (+15 %) | 11.13 s (+38 % **!**) | 13.72 s (+54 % **!**) | 16.30 s (+32 %) | 24.16 s (+25 %) | 23.64 s (+58 % **!**) |
| repeated after restart | before | 0.33 s | 0.52 s | 0.63 s | 0.98 s | 1.77 s | 3.48 s | 3.48 s |
| | after | 0.36 s | 0.42 s (-19 %) | 0.74 s (+19 %) | 1.09 s (+11 %) | 2.22 s (+25 %) | 5.32 s (+53 % **!**) | 3.18 s (-9 %) |

| by stage | | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| key load | before | 0.09 s | 0.21 s | 0.15 s | 0.27 s | 0.84 s | 1.31 s | 1.18 s |
| | after | 0.10 s | 0.16 s (-24 %) | 0.22 s (+47 % **!**) | 0.59 s (+119 % **!**) | 0.93 s (+11 %) | 2.92 s (+123 % **!**) | 2.36 s (+100 % **!**) |
| witness | before | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| | after | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s | 0.00 s |
| prove | before | 0.37 s | 0.43 s | 0.60 s | 0.95 s | 1.75 s | 3.29 s | 3.32 s |
| | after | 0.29 s (-20 %) | 0.41 s | 0.67 s (+11 %) | 1.05 s (+11 %) | 2.34 s (+34 %) | 5.38 s (+63 % **!**) | 4.23 s (+27 %) |

### Proof, last 20 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) | 2026-10-29 | 0.29 s | 0.41 s | 0.67 s | 1.05 s | 2.34 s | 5.38 s | 4.23 s |
| [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) | 2026-10-29 | 0.37 s | 0.43 s | 0.60 s | 0.95 s | 1.75 s | 3.29 s | 3.32 s |
| [`ec81dbd`](https://github.com/helius-labs/zolana-web-sdk/commit/ec81dbd3e00b6683b91e37f10f10d152307f32a0) | 2026-10-29 | 0.27 s | 0.43 s | 0.61 s | 0.93 s | 1.86 s | 4.40 s | 3.34 s |
| [`ded898d`](https://github.com/helius-labs/zolana-web-sdk/commit/ded898dd414788780bf0b5479016cfd1535d31e8) | 2026-10-27 | 0.39 s | 0.47 s | 0.61 s | 1.00 s | 1.84 s | 4.70 s | 3.32 s |
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

### First run after a restart, last 20 commits

| commit | date | 1 → 2 | 2 → 2 | 4 → 2 | 8 → 2 | 16 → 2 | 24 → 2 | merge 24 → 1 |
|---|---|---|---|---|---|---|---|---|
| [`a537558`](https://github.com/helius-labs/zolana-web-sdk/commit/a53755812cf4f3bb891babb39c5aa8bde98f0913) | 2026-10-29 | 12.79 s | 12.49 s | 11.13 s | 13.72 s | 16.30 s | 24.16 s | 23.64 s |
| [`e80b3e0`](https://github.com/helius-labs/zolana-web-sdk/commit/e80b3e0076f08b880a260e2567d3db10f6ce1968) | 2026-10-29 | 9.01 s | 10.82 s | 8.07 s | 8.90 s | 12.32 s | 19.33 s | 14.96 s |
| [`ec81dbd`](https://github.com/helius-labs/zolana-web-sdk/commit/ec81dbd3e00b6683b91e37f10f10d152307f32a0) | 2026-10-29 | 9.16 s | 9.13 s | 8.62 s | 9.50 s | 12.35 s | 22.62 s | 20.49 s |
| [`ded898d`](https://github.com/helius-labs/zolana-web-sdk/commit/ded898dd414788780bf0b5479016cfd1535d31e8) | 2026-10-27 | 11.21 s | 12.01 s | 8.32 s | 14.12 s | 14.40 s | 18.13 s | 12.73 s |
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
