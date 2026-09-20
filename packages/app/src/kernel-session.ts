import type { KernelAdapter } from '@cadw/kernel';
import { createWorkerKernel } from '@cadw/kernel-occt/client';

/** Lazily starts one CAD worker per page; the kernel WASM loads on first use. */
let session: { kernel: KernelAdapter; terminate: () => void } | null = null;
export function getKernel(): KernelAdapter {
  session ??= createWorkerKernel();
  return session.kernel;
}
