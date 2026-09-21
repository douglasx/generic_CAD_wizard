# Architecture

```mermaid
flowchart TD
  EMB[embed] --> UI
  DESK[desktop: Tauri] --> UI
  UI[app: React] --> R[render: three.js]
  UI --> PL[platform adapter]
  UI --> CMD[core: document, commands, undo]
  UI --> KC[kernel-occt client]
  R --> CMD
  CMD --> G2[geom2d]
  KC -.CAD worker.-> OCC[kernel-occt: libcascade]
  KC --> KA[kernel: KernelAdapter]
  OCC --> KA
  IO[io-native] --> CMD
```

Allowed imports are enforced by `.dependency-cruiser.cjs`:

| Package | May import |
| --- | --- |
| core, platform | nothing internal |
| geom2d, kernel | core (types and tolerances only; ADR 0008) |
| kernel-occt | kernel, core |
| io-native | core |
| render | core, geom2d |
| app | everything except kernel-occt internals (only its `client` entry) |
| desktop | app, platform |

Key rules: the kernel lives only in the CAD worker; the UI talks to it through `KernelAdapter` via Comlink; all edits are `Command`s recorded in the `History` journal; web and desktop differ only in `PlatformAdapter`.
