/** Builds corpus/cadw/all-entities.cadw — one of every entity kind, for e2e and visual checks. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { addEntity, createDocument, History, sequentialIds, type Entity, type EntityId } from '../../packages/core/src/index.ts';
import { writeCadw } from '../../packages/io-native/src/index.ts';

const ids = sequentialIds();
const id = () => ids.next('e') as EntityId;
const entities: Entity[] = [
  { id: id(), kind: 'line', layer: '0', start: [-200, -100, 0], end: [200, -100, 0] },
  { id: id(), kind: 'polyline', layer: '0', points: [[-200, -60, 0], [-100, 20, 0], [0, -60, 0], [100, 20, 0]], closed: false },
  { id: id(), kind: 'arc', layer: '0', center: [-120, 80, 0], radius: 60, startAngle: 0, endAngle: Math.PI },
  { id: id(), kind: 'circle', layer: '0', center: [40, 80, 0], radius: 50 },
  { id: id(), kind: 'ellipse', layer: '0', center: [180, 80, 0], majorAxis: [70, 20, 0], ratio: 0.45 },
  { id: id(), kind: 'spline', layer: '0', points: [[-200, 160, 0], [-80, 220, 0], [40, 140, 0], [180, 200, 0]], closed: false },
];

const h = new History(createDocument('All entities'));
for (const e of entities) h.execute(addEntity(e));
mkdirSync('corpus/cadw', { recursive: true });
writeFileSync('corpus/cadw/all-entities.cadw', writeCadw(h.doc));
console.log(`wrote corpus/cadw/all-entities.cadw with ${entities.length} entities`);
