import { describe, expect, it } from 'vitest';
import {
  addEntity,
  addLayer,
  batch,
  createDocument,
  DEFAULT_LAYER,
  deleteLayer,
  History,
  layerUsage,
  nextLayerName,
  replay,
  setCurrentLayer,
  sortedLayers,
  updateEntity,
  updateLayer,
  type EntityId,
  type Layer,
  type LineEntity,
} from '../src/index.ts';

const layer = (id: string, name = id): Layer => ({ ...DEFAULT_LAYER, id, name });
const line = (id: string, layerId: string): LineEntity => ({ id: id as EntityId, kind: 'line', layer: layerId, start: [0, 0, 0], end: [1, 0, 0] });

describe('layer commands (REQ-003.8)', () => {
  it('add, rename, recolour, set current — each undoable and replayable', () => {
    const start = createDocument();
    const h = new History(start);
    h.execute(addLayer(layer('L1', 'Stiffeners')));
    h.execute(updateLayer('L1', { name: 'Longitudinals', color: '#ff8800', lineweightMm: 0.5, linetype: 'dashed' }));
    h.execute(setCurrentLayer('L1'));
    expect(h.doc.layers['L1']).toMatchObject({ name: 'Longitudinals', color: '#ff8800', lineweightMm: 0.5, linetype: 'dashed' });
    expect(h.doc.currentLayer).toBe('L1');
    expect(replay(start, h.journal)).toEqual(h.doc);
    h.undo();
    expect(h.doc.currentLayer).toBe('0');
    h.undo();
    expect(h.doc.layers['L1']).toEqual(layer('L1', 'Stiffeners'));
    h.undo();
    expect(h.doc.layers['L1']).toBeUndefined();
  });

  it('refuses bad names, colours, lineweights and linetypes', () => {
    const h = new History(createDocument());
    h.execute(addLayer(layer('L1', 'Hull')));
    expect(() => h.execute(addLayer(layer('L2', 'hull')))).toThrow(/already exists/);
    expect(() => h.execute(updateLayer('L1', { name: '  ' }))).toThrow(/empty/);
    expect(() => h.execute(updateLayer('L1', { color: 'red' }))).toThrow(/colour/);
    expect(() => h.execute(updateLayer('L1', { lineweightMm: 5 }))).toThrow(/Lineweight/);
    expect(() => h.execute(updateLayer('L1', { linetype: 'wavy' }))).toThrow(/linetype/);
    expect(() => h.execute(updateLayer('L1', { name: 'Hull' }))).not.toThrow(); // renaming to itself is fine
  });

  it('delete: only empty layers that are neither 0 nor current', () => {
    const h = new History(createDocument());
    h.execute(addLayer(layer('L1')));
    h.execute(addEntity(line('a', 'L1')));
    expect(() => h.execute(deleteLayer('0'))).toThrow(/Layer 0/);
    expect(() => h.execute(deleteLayer('L1'))).toThrow(/1 object/);
    h.execute(setCurrentLayer('L1'));
    expect(() => h.execute(deleteLayer('L1'))).toThrow(/current/);
    h.execute(setCurrentLayer('0'));
    h.execute(updateEntity(line('a', '0')));
    h.execute(deleteLayer('L1'));
    expect(h.doc.layers['L1']).toBeUndefined();
    h.undo();
    expect(h.doc.layers['L1']).toBeDefined();
  });

  it('moving objects between layers is one batch of updateEntity', () => {
    const h = new History(createDocument());
    h.execute(addLayer(layer('L1')));
    h.execute(addEntity(line('a', '0')));
    h.execute(addEntity(line('b', '0')));
    h.execute(batch([updateEntity(line('a', 'L1')), updateEntity(line('b', 'L1'))], 'move to layer'));
    expect(layerUsage(h.doc)).toEqual({ L1: 2 });
    h.undo();
    expect(layerUsage(h.doc)).toEqual({ '0': 2 });
  });

  it('locking a layer blocks edits to its objects, and unlocking restores them', () => {
    const h = new History(createDocument());
    h.execute(addEntity(line('a', '0')));
    h.execute(updateLayer('0', { locked: true }));
    expect(() => h.execute(updateEntity({ ...line('a', '0'), end: [5, 0, 0] }))).toThrow(/locked/);
    h.execute(updateLayer('0', { locked: false }));
    expect(() => h.execute(updateEntity({ ...line('a', '0'), end: [5, 0, 0] }))).not.toThrow();
  });

  it('helpers: next free name, natural sort with 0 first', () => {
    const h = new History(createDocument());
    expect(nextLayerName(h.doc)).toBe('Layer 1');
    h.execute(addLayer(layer('x', 'Layer 1')));
    h.execute(addLayer(layer('y', 'Layer 10')));
    h.execute(addLayer(layer('z', 'Layer 2')));
    expect(nextLayerName(h.doc)).toBe('Layer 3');
    expect(sortedLayers(h.doc).map((l) => l.name)).toEqual(['0', 'Layer 1', 'Layer 2', 'Layer 10']);
  });
});
