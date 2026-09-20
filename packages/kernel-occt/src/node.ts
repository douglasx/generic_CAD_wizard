import { createInstance } from 'libcascade/single/init';
import { LibcascadeKernel } from './libcascade-kernel.ts';

/** In-process kernel for Node (tests, CLI, headless optimisation). */
export async function createNodeKernel(options: { quiet?: boolean } = {}): Promise<LibcascadeKernel> {
  const quiet = options.quiet ?? true;
  const oc = await createInstance(quiet ? { print: () => {}, printErr: () => {} } : {});
  return new LibcascadeKernel(oc);
}

export { LibcascadeKernel };
