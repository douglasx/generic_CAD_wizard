/// <reference lib="webworker" />
import * as Comlink from 'comlink';
import { createInstance } from 'libcascade/single/init';
import wasmUrl from 'libcascade/single/wasm?url';
import type { KernelAdapter } from '@cadw/kernel';
import { LibcascadeKernel } from './libcascade-kernel.ts';

/**
 * The CAD worker. The kernel loads lazily on first call so the UI (and 2D
 * drafting) never waits for the ~8.6 MB WASM download.
 */
let kernelPromise: Promise<LibcascadeKernel> | null = null;
function kernel(): Promise<LibcascadeKernel> {
  kernelPromise ??= createInstance({
    locateFile: () => wasmUrl,
    print: () => {},
    printErr: () => {},
  }).then((oc) => new LibcascadeKernel(oc));
  return kernelPromise;
}

const api: KernelAdapter = {
  info: async () => (await kernel()).info(),
  makeBox: async (x, y, z) => (await kernel()).makeBox(x, y, z),
  volume: async (id) => (await kernel()).volume(id),
  boundingBox: async (id) => (await kernel()).boundingBox(id),
  tessellate: async (id, o) => {
    const mesh = await (await kernel()).tessellate(id, o);
    return Comlink.transfer(mesh, [mesh.positions.buffer, mesh.indices.buffer]);
  },
  exportStep: async (parts) => (await kernel()).exportStep(parts),
  importStep: async (text) => (await kernel()).importStep(text),
  release: async (ids) => (await kernel()).release(ids),
  liveHandles: async () => (await kernel()).liveHandles(),
};

Comlink.expose(api);
