# ADR 0002 — Parametric feature graph, external optimisers

- Status: Accepted (2026-09-19)
- Requirements: REQ-003, REQ-010

Decision: geometry is the output of a directed acyclic graph of features driven by named, typed, unit-aware parameters and expressions (nTop-block / Grasshopper style). A headless `evaluate(parameters) → {geometry, metrics}` API runs in the CAD worker or Node; a CLI with JSON in/out is the first interface, for Python and other external tools. No in-app optimiser in v1.

Backlog: 2D sketch constraints (planegcs, LGPL), implicit/field kernel, built-in optimisers.

Consequences: stable references across regenerations are the main risk (topological naming); every feature needs determinism and parameter-sweep tests (guardrail 13). M0 only lays the command/journal groundwork; the graph arrives in M5.
