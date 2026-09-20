# ADR 0006 — Exchange formats

- Status: Accepted (2026-09-19)
- Requirements: REQ-004, REQ-005, REQ-006, REQ-007, REQ-011

| Format | Import | Export |
| --- | --- | --- |
| Native `.cadw` | fflate zip of `document.json` + BREP files | same |
| STEP | libcascade `STEPCAFControl_Reader` | libcascade `STEPCAFControl_Writer` |
| OpenUSD | three.js USDLoader, later TinyUSDZ | own USDA writer, validated by `usdchecker` |
| DXF | dxf-parser (MIT) | @tarikjabiri/dxf (MIT) |
| PDF | — | jsPDF vector output |
