---
name: print-verifier
description: Verify PDF output: rasterise pages, diff against baselines, and measure scale on a known 100 mm line. Use when touching drafting, layouts or print-pdf.
---

# Print verifier

Read `CLAUDE.md` first; its guardrails override anything here.

1. Render PDFs to PNG (pdf.js in Playwright or `pdftoppm` in CI) at 300 dpi.
2. Pixel diff ≤ 0.1% against `corpus/print/*.png` baselines.
3. Scale check: the test sheet has a 100 mm reference line; measured length must be 100 ± 0.1 mm at 1:1 and scaled correctly at 1:50, 1:100.
4. Confirm fonts are embedded and lines are vector (no raster images of geometry).
