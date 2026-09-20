import { beforeAll, describe, expect, it } from 'vitest';
import type { KernelAdapter } from './index.ts';

/**
 * Contract every KernelAdapter implementation must pass.
 * Usage: defineKernelContract('libcascade', () => createKernel());
 */
export function defineKernelContract(name: string, factory: () => Promise<KernelAdapter>): void {
  describe(`KernelAdapter contract: ${name}`, () => {
    let k: KernelAdapter;
    beforeAll(async () => {
      k = await factory();
    }, 120_000);

    it('reports its identity', async () => {
      const info = await k.info();
      expect(info.name.length).toBeGreaterThan(0);
    });

    it('makes a box with exact volume and bounding box (REQ-010.1)', async () => {
      const base = await k.liveHandles();
      const box = await k.makeBox(2000, 1000, 12);
      expect(await k.volume(box)).toBeCloseTo(24_000_000, 3);
      const bb = await k.boundingBox(box);
      expect(bb.max[0] - bb.min[0]).toBeCloseTo(2000, 3);
      expect(bb.max[2] - bb.min[2]).toBeCloseTo(12, 3);
      await k.release([box]);
      expect(await k.liveHandles()).toBe(base);
    });

    it('tessellates a box into 12 triangles over 24 vertices', async () => {
      const box = await k.makeBox(10, 20, 30);
      const mesh = await k.tessellate(box);
      expect(mesh.indices.length).toBe(36);
      expect(mesh.positions.length).toBe(24 * 3);
      expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3);
      await k.release([box]);
    });

    it('round-trips STEP names and typed attributes (REQ-007.1, spike S-02)', async () => {
      const base = await k.liveHandles();
      const plate = await k.makeBox(2000, 1000, 12);
      const step = await k.exportStep([
        {
          shape: plate,
          name: 'PLT-001',
          attributes: {
            material: { kind: 'text', value: 'AH36' },
            thickness_mm: { kind: 'real', value: 12.5 },
            frame_from: { kind: 'integer', value: 42 },
          },
        },
      ]);
      expect(step).toContain('ISO-10303-21');
      const parts = await k.importStep(step);
      expect(parts).toHaveLength(1);
      const [p] = parts;
      expect(p!.name).toBe('PLT-001');
      expect(p!.attributes).toEqual({
        material: { kind: 'text', value: 'AH36' },
        thickness_mm: { kind: 'real', value: 12.5 },
        frame_from: { kind: 'integer', value: 42 },
      });
      expect(await k.volume(p!.shape)).toBeCloseTo(24_000_000, 3);
      await k.release([plate, p!.shape]);
      expect(await k.liveHandles()).toBe(base);
    });

    it('keeps non-ASCII names and text attributes', async () => {
      const box = await k.makeBox(1, 1, 1);
      const step = await k.exportStep([
        { shape: box, name: 'Skott 3 – ståltank', attributes: { note: { kind: 'text', value: '厚度 12 mm, 20 °C' } } },
      ]);
      const [p] = await k.importStep(step);
      expect(p!.name).toBe('Skott 3 – ståltank');
      expect(p!.attributes.note).toEqual({ kind: 'text', value: '厚度 12 mm, 20 °C' });
      await k.release([box, p!.shape]);
    });

    it('rejects unknown shapes and bad arguments', async () => {
      await expect(k.volume('nope' as never)).rejects.toThrow(/Unknown shape/);
      await expect(k.makeBox(0, 1, 1)).rejects.toThrow(/positive/);
    });

    it('rejects invalid STEP text', async () => {
      await expect(k.importStep('not a step file')).rejects.toThrow();
    });
  });
}
