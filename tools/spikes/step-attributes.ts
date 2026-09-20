/**
 * SPIKE S-02: STEP user-defined attribute round trip, and the reference file
 * for manual checks in NAPA, Smart 3D, Creo, NX, SolidWorks, Rhino, FreeCAD.
 *
 * Usage: pnpm spike:step-attributes   → corpus/step/plate-attributes.step
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNodeKernel } from '../../packages/kernel-occt/src/node.ts';

const k = await createNodeKernel();
const plate = await k.makeBox(2000, 1000, 12);
const stiffener = await k.makeBox(2000, 10, 150);
const step = await k.exportStep([
  {
    shape: plate,
    name: 'PLT-001',
    attributes: {
      template: { kind: 'text', value: 'hull-plating' },
      material: { kind: 'text', value: 'AH36' },
      thickness_mm: { kind: 'real', value: 12 },
      strake: { kind: 'text', value: 'K' },
      frame_from: { kind: 'integer', value: 42 },
      frame_to: { kind: 'integer', value: 46 },
    },
  },
  {
    shape: stiffener,
    name: 'STF-001',
    attributes: {
      template: { kind: 'text', value: 'stiffener' },
      profile: { kind: 'text', value: 'FB 150x10' },
      material: { kind: 'text', value: 'AH36' },
      length_mm: { kind: 'real', value: 2000 },
    },
  },
]);
mkdirSync('corpus/step', { recursive: true });
writeFileSync('corpus/step/plate-attributes.step', step);

const parts = await k.importStep(step);
let ok = parts.length === 2;
for (const p of parts) {
  console.log(p.name, JSON.stringify(p.attributes));
  if (Object.keys(p.attributes).length === 0) ok = false;
}
console.log(ok ? 'PASS: attributes round-tripped' : 'FAIL');
process.exit(ok ? 0 : 1);
