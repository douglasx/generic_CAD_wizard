import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  addEntity,
  createDocument,
  deleteEntity,
  entityList,
  History,
  replay,
  sequentialIds,
  CommandError,
  type EntityId,
  type LineEntity,
} from '../src/index.ts';

const ids = sequentialIds();
const line = (x1: number, y1: number, x2: number, y2: number): LineEntity => ({
  id: ids.next('ent') as EntityId,
  kind: 'line',
  layer: '0',
  start: [x1, y1, 0],
  end: [x2, y2, 0],
});

describe('History (REQ-003.1)', () => {
  it('adds a line, undoes and redoes it', () => {
    const h = new History(createDocument());
    const l = line(0, 0, 100, 0);
    h.execute(addEntity(l));
    expect(entityList(h.doc)).toEqual([l]);
    h.undo();
    expect(entityList(h.doc)).toEqual([]);
    h.redo();
    expect(entityList(h.doc)).toEqual([l]);
  });

  it('delete restores the original position on undo', () => {
    const h = new History(createDocument());
    const [a, b, c] = [line(0, 0, 1, 0), line(0, 0, 2, 0), line(0, 0, 3, 0)];
    [a, b, c].forEach((e) => h.execute(addEntity(e)));
    h.execute(deleteEntity(b.id));
    expect(h.doc.order).toEqual([a.id, c.id]);
    h.undo();
    expect(h.doc.order).toEqual([a.id, b.id, c.id]);
  });

  it('keeps at most `limit` undo steps', () => {
    const h = new History(createDocument(), 3);
    for (let i = 0; i < 5; i++) h.execute(addEntity(line(0, 0, i + 1, 0)));
    let undos = 0;
    while (h.canUndo) {
      h.undo();
      undos++;
    }
    expect(undos).toBe(3);
    expect(h.doc.order.length).toBe(2);
  });

  it('clears redo after a new command', () => {
    const h = new History(createDocument());
    h.execute(addEntity(line(0, 0, 1, 0)));
    h.undo();
    h.execute(addEntity(line(0, 0, 2, 0)));
    expect(h.canRedo).toBe(false);
  });

  it('rejects duplicate ids and unknown layers without changing the document', () => {
    const h = new History(createDocument());
    const l = line(0, 0, 1, 0);
    h.execute(addEntity(l));
    const before = h.doc;
    expect(() => h.execute(addEntity(l))).toThrow(CommandError);
    expect(() => h.execute(addEntity({ ...l, id: 'x' as EntityId, layer: 'nope' }))).toThrow(CommandError);
    expect(h.doc).toBe(before);
  });

  it('notifies subscribers', () => {
    const h = new History(createDocument());
    let count = 0;
    const off = h.subscribe(() => count++);
    h.execute(addEntity(line(0, 0, 1, 0)));
    h.undo();
    off();
    h.redo();
    expect(count).toBe(2);
  });

  it('property: replaying the journal reproduces the document', () => {
    const op = fc.oneof(
      fc.record({ kind: fc.constant('add' as const), x: fc.double({ min: -1e6, max: 1e6, noNaN: true }) }),
      fc.constant({ kind: 'undo' as const }),
      fc.constant({ kind: 'redo' as const }),
    );
    fc.assert(
      fc.property(fc.array(op, { maxLength: 40 }), (ops) => {
        const gen = sequentialIds();
        const start = createDocument();
        const h = new History(start, Number.POSITIVE_INFINITY);
        for (const o of ops) {
          if (o.kind === 'add')
            h.execute(addEntity({ id: gen.next('e') as EntityId, kind: 'line', layer: '0', start: [0, 0, 0], end: [o.x, 0, 0] }));
          else if (o.kind === 'undo') h.undo();
          else h.redo();
        }
        expect(replay(start, h.journal)).toEqual(h.doc);
      }),
    );
  });

  it('property: undo after any command returns the previous document', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 1, maxLength: 20 }), (xs) => {
        const gen = sequentialIds();
        const h = new History(createDocument(), Number.POSITIVE_INFINITY);
        for (const x of xs) {
          const before = h.doc;
          h.execute(addEntity({ id: gen.next('e') as EntityId, kind: 'line', layer: '0', start: [0, 0, 0], end: [x, 1, 0] }));
          h.undo();
          expect(h.doc).toEqual(before);
          h.redo();
        }
      }),
    );
  });
});
