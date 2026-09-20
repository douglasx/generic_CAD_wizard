---
name: module-contract
description: Define or change a package's public TypeScript API together with a contract test suite that any implementation must pass. Use when adding a package, adapter or cross-package interface.
---

# Module contract

Read `CLAUDE.md` first; its guardrails override anything here.

1. Public API lives in `packages/<pkg>/src/index.ts`; export types, not implementation details.
2. Interfaces that may have several implementations (e.g. `KernelAdapter`, `PlatformAdapter`, `KeyValueStore`) get a reusable contract suite, like `packages/kernel/src/contract.ts` (`defineKernelContract`).
3. Every implementation's test file calls the contract suite; CI fails if one does not.
4. Update `.dependency-cruiser.cjs` and `specs/architecture.md` if allowed imports change. Run `pnpm lint:layers`.
5. Breaking changes to a contract need an ADR.
