# Third-party notices

| Component | Version | License | How it is used |
| --- | --- | --- | --- |
| Open CASCADE Technology via [libcascade](https://github.com/taucad/opencascade.js) | OCCT 8.0.1 / libcascade 3.0.2 | LGPL-2.1 with OCCT exception | Loaded at runtime as a separate `.wasm` file inside the CAD worker. It is not compiled into our JavaScript. Users can replace the file with their own build of the same interface. |
| three.js | 0.186 | MIT | Viewport rendering |
| React / React DOM | 19 | MIT | UI shell |
| comlink | 4 | Apache-2.0 | Worker RPC |
| fflate | 0.8 | MIT | `.cadw` zip container |
| Tauri | 2 | MIT / Apache-2.0 | Desktop shell |

LGPL compliance notes (not legal advice):

1. The OCCT WebAssembly binary ships unmodified as its own file (`opencascade_single.wasm`).
2. Its source is available at https://github.com/taucad/opencascade.js and https://github.com/Open-Cascade-SAS/OCCT.
3. The kernel is reached only through `packages/kernel` (`KernelAdapter`), so a relinked or replacement build can be dropped in.
