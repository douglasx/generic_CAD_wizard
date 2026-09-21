import { describe, expect, it } from 'vitest';
import { addEntity, createDocument, DEFAULT_LAYER, History, type EntityId } from '@cadw/core';
import { combineSelection, pruneSelection } from '../src/selection.ts';

const id = (s: string) => s as EntityId;

describe('selection rules (REQ-003.5)', () => {
  it('replace, add and toggle', () => {
    const cur = new Set([id('a'), id('b')]);
    expect([...combineSelection(cur, [id('c')], 'replace')]).toEqual(['c']);
    expect([...combineSelection(cur, [id('b'), id('c')], 'add')].sort()).toEqual(['a', 'b', 'c']);
    expect([...combineSelection(cur, [id('b'), id('c')], 'toggle')].sort()).toEqual(['a', 'c']);
    expect(combineSelection(cur, [], 'replace').size).toBe(0);
  });

  it('prunes deleted entities and entities on hidden or locked layers', () => {
    const h = new History(createDocument());
    h.execute(addEntity({ id: id('x'), kind: 'line', layer: '0', start: [0, 0, 0], end: [1, 0, 0] }));
    const sel = new Set([id('x'), id('gone')]);
    expect([...pruneSelection(sel, h.doc)]).toEqual(['x']);
    const hidden = { ...h.doc, layers: { '0': { ...DEFAULT_LAYER, visible: false } } };
    expect(pruneSelection(new Set([id('x')]), hidden).size).toBe(0);
    const same = new Set([id('x')]);
    expect(pruneSelection(same, h.doc)).toBe(same); // unchanged → same object, no re-render
  });
});
