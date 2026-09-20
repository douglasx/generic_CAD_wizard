# SPIKE S-01 — Kernel download size

Date: 2026-09-19. Script: `tools/spikes/kernel_size.py` (gzip -9, brotli q11 on the shipped `.wasm`).

| Package | OCCT | Raw | gzip | brotli |
| --- | --- | --- | --- | --- |
| occt-wasm 5.3.2 | 8.0.1 | 22.3 MB | 7.0 MB | 4.9 MB |
| libcascade 3.0.2 (single-threaded) | 8.0.1 | 42.7 MB | 12.2 MB | 8.6 MB |
| opencascade.js 1.1.1 (legacy npm) | 7.x | 65.9 MB | 13.7 MB | 9.5 MB |

Result: occt-wasm's "~4.5 MB" claim holds (4.9 MB measured). libcascade is ~1.75× larger. Chosen anyway because of S-02 (ADR 0001).
Follow-up: trimmed libcascade build with `@libcascade/toolchain` once the symbol set stabilises (target ≤ 5 MB brotli).
