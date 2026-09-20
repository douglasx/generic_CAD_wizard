import * as Comlink from 'comlink';
import type { KernelAdapter } from '@cadw/kernel';

/** Starts the dedicated CAD worker and returns a KernelAdapter proxy to it. */
export function createWorkerKernel(): { kernel: KernelAdapter; terminate: () => void } {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'cad-worker' });
  const remote = Comlink.wrap<KernelAdapter>(worker);
  return { kernel: remote as unknown as KernelAdapter, terminate: () => worker.terminate() };
}
