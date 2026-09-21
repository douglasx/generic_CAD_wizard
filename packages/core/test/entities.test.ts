import { describe, expect, it } from 'vitest';
import {
  addEntity,
  createDocument,
  DEFAULT_LAYER,
  deleteEntity,
  ENTITY_KINDS,
  entityList,
  History,
  layerOf,
  migrateDocument,
  resolveStyle,
  SCHEMA_VERSION,
  SchemaError,
  sequentialIds,
  visibleEntities,
  type ArcEntity,
  type CadDocument,
  type CircleEntity,
  type EllipseEntity,
  type Entity,
  type EntityId,
  type PolylineEntity,
  type SplineEntity,
} from '../src/index.ts';

const ids = sequentialIds();
const id = () => ids.next('e') as EntityId;

const samples: Record<string, Entity> = {
  line: { id: id(), kind: 'line', layer: '0', start: [0, 0, 0], end: [100, 0, 0] },
  polyline: { id: id(), kind: 'polyline', layer: '0', points: [[0, 0, 0], [50, 20, 0], [90, 0, 0]], closed: false },
  arc: { id: id(), kind: 'arc', layer: '0', center: [0, 0, 0], radius: 50, startAngle: 0, endAngle: Math.PI / 2 },
  circle: { id: id(), kind: 'circle', layer: '0', center: [10, 10, 0], radius: 25 },
  ellipse: { id: id(), kind: 'ellipse', layer: '0', center: [0, 0, 0], majorAxis: [40, 0, 0], ratio: 0.5 },
  spline: { id: id(), kind: 'spline', layer: '0', points: [[0, 0, 0], [30, 40, 0], [70, -20, 0], [100, 10, 0]], closed: false },
};

describe('entity model (REQ-003.1)', () => {
  it('covers every declared entity kind', () => {
    expect(Object.keys(samples).sort()).toEqual([...ENTITY_KINDS].sort());
  });

  it('adds and removes each kind, with exact inverses', () => {
    const h = new History(createDocument());
    for (const e of Object.values(samples)) h.execute(addEntity(e));
    expect(entityList(h.doc)).toHaveLength(ENTITY_KINDS.length);
    const full = h.doc;
    for (const e of Object.values(samples)) h.execute(deleteEntity(e.id));
    expect(entityList(h.doc)).toHaveLength(0);
    for (let i = 0; i < ENTITY_KINDS.length; i++) h.undo();
    expect(h.doc).toEqual(full);
  });

  it('survives a save/load round trip through JSON', () => {
    const h = new History(createDocument('Shell expansion'));
    for (const e of Object.values(samples)) h.execute(addEntity(e));
    expect(migrateDocument(JSON.parse(JSON.stringify(h.doc)))).toEqual(h.doc);
  });
});

describe('layers and style', () => {
  const docWith = (layer: Partial<(typeof DEFAULT_LAYER)>): CadDocument => {
    const base = createDocument();
    return { ...base, layers: { ...base.layers, '0': { ...DEFAULT_LAYER, ...layer } } };
  };

  it('falls back to the layer for unset style fields', () => {
    const doc = docWith({ color: '#ff0000', lineweightMm: 0.7, linetype: 'dashed' });
    const e = { ...samples.line!, style: { color: '#00ff00' } };
    expect(resolveStyle(doc, e)).toEqual({ color: '#00ff00', lineweightMm: 0.7, linetype: 'dashed' });
    expect(resolveStyle(doc, samples.line!)).toEqual({ color: '#ff0000', lineweightMm: 0.7, linetype: 'dashed' });
    expect(layerOf(doc, samples.line!).name).toBe('0');
  });

  it('hides entities on invisible layers but keeps them in the document', () => {
    const h = new History(docWith({ visible: false }));
    h.execute(addEntity(samples.circle!));
    expect(entityList(h.doc)).toHaveLength(1);
    expect(visibleEntities(h.doc)).toHaveLength(0);
  });

  it('refuses edits on a locked layer', () => {
    const h = new History(docWith({ locked: true }));
    expect(() => h.execute(addEntity(samples.arc!))).toThrow(/locked/);
  });
});

describe('migration v1 → v2 (guardrail 3)', () => {
  // A document exactly as M0 wrote it.
  const v1 = {
    schemaVersion: 1,
    units: 'mm',
    name: 'Untitled',
    layers: { '0': { id: '0', name: '0', color: '#e6e6e6', visible: true } },
    entities: { line_1: { id: 'line_1', kind: 'line', layer: '0', start: [0, 0, 0], end: [10, 5, 0] } },
    order: ['line_1'],
  };

  it('upgrades layers and adds currentLayer, keeping entities', () => {
    const doc = migrateDocument(JSON.parse(JSON.stringify(v1)));
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.currentLayer).toBe('0');
    expect(doc.layers['0']).toEqual(DEFAULT_LAYER);
    expect(entityList(doc)).toHaveLength(1);
  });

  it('still rejects newer and malformed documents', () => {
    expect(() => migrateDocument({ ...v1, schemaVersion: 99 })).toThrow(/newer/);
    expect(() => migrateDocument({ ...v1, schemaVersion: 0 })).toThrow(SchemaError);
    const orphan = { ...createDocument(), currentLayer: 'nope' };
    expect(() => migrateDocument(JSON.parse(JSON.stringify(orphan)))).toThrow(/Current layer/);
  });
});

export const entitySamples = samples;
export type { ArcEntity, CircleEntity, EllipseEntity, PolylineEntity, SplineEntity };
