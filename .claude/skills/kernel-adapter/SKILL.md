---
name: kernel-adapter
description: Add or change geometry-kernel operations behind KernelAdapter using libcascade, verifying APIs against the shipped type definitions. Use whenever code calls OCCT.
---

# Kernel adapter

Read `CLAUDE.md` first; its guardrails override anything here.

1. Look the API up in `node_modules/libcascade/dist/types.d.ts` (guardrail 11). Prove unusual calls with a throwaway script run by `node` before relying on them.
2. Add the method to `KernelAdapter` (`packages/kernel/src/index.ts`) and a contract test in `packages/kernel/src/contract.ts`.
3. Implement in `packages/kernel-occt/src/libcascade-kernel.ts`: `.delete()` every temporary in `finally`; only long-lived shapes go in the shape map.
4. Expose it in `packages/kernel-occt/src/worker.ts`; transfer typed arrays with `Comlink.transfer`.
5. Known libcascade quirks: NamedData maps are not iterable from JS (collect keys from STEP text); `TCollection_ExtendedString(s, true)` for UTF-8; STEP text attributes read back as Latin-1 (use `repairUtf8`).
