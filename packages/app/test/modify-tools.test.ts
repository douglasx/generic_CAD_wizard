import { describe, expect, it } from 'vitest';
import { addEntity, createDocument, entityList, History, sequentialIds, type EntityId, type LineEntity } from '@cadw/core';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';
import { MODIFY_TOOLS } from '../src/commands/tools/modify.ts';

function setup(n = 2) {
  const history = new History(createDocument());
  for (let i = 0; i < n; i++)
    history.execute(addEntity({ id: `l${i}` as EntityId, kind: 'line', layer: '0', start: [0, i * 10, 0], end: [100, i * 10, 0] }));
  let selection: readonly EntityId[] = [];
  const port = { get: () => selection, set: (ids: readonly EntityId[]) => (selection = ids) };
  const session = new CommandSession(history, sequentialIds(), [...DRAW_TOOLS, ...MODIFY_TOOLS], port);
  return { history, session, select: (...ids: string[]) => (selection = ids as EntityId[]), selection: () => selection };
}
const lines = (h: History) => entityList(h.doc) as LineEntity[];

describe('MOVE (REQ-003.6)', () => {
  it('moves the pre-selection as one undo step and clears the selection', () => {
    const t = setup();
    t.select('l0', 'l1');
    for (const x of ['M', '0,0', '@25,-5']) t.session.submit(x);
    expect(lines(t.history).map((l) => l.start)).toEqual([[25, -5, 0], [25, 5, 0]]);
    expect(t.selection()).toEqual([]);
    t.history.undo();
    expect(lines(t.history)[0]!.start).toEqual([0, 0, 0]);
  });

  it('asks to select first when nothing is selected; Enter with none selected complains', () => {
    const t = setup();
    t.session.submit('MOVE');
    expect(t.session.snapshot.prompt).toBe('MOVE Select objects, then press Enter:');
    expect(t.session.wantsSelection).toBe(true);
    t.session.submit('');
    expect(t.session.snapshot.log.at(-1)).toMatch(/Nothing selected/);
    t.select('l1');
    t.session.submit('');
    expect(t.session.snapshot.prompt).toBe('MOVE (1 selected) Specify base point:');
    t.session.submit('0,0');
    t.session.submit('@0,100');
    expect(lines(t.history)[1]!.start).toEqual([0, 110, 0]);
    expect(lines(t.history)[0]!.start).toEqual([0, 0, 0]);
  });

  it('previews the moved entities during the second point', () => {
    const t = setup(1);
    t.select('l0');
    t.session.submit('M');
    t.session.submit('0,0');
    const [p] = t.session.preview([10, 10]) as LineEntity[];
    expect(p!.start).toEqual([10, 10, 0]);
  });
});

describe('COPY', () => {
  it('places repeated copies until Enter, each one undo step', () => {
    const t = setup(1);
    t.select('l0');
    for (const x of ['CO', '0,0', '@0,20', '@0,40', '']) t.session.submit(x);
    expect(lines(t.history)).toHaveLength(3);
    expect(new Set(lines(t.history).map((l) => l.id)).size).toBe(3);
    t.history.undo();
    expect(lines(t.history)).toHaveLength(2);
  });
});

describe('ERASE', () => {
  it('erases a pre-selection immediately', () => {
    const t = setup(3);
    t.select('l0', 'l2');
    t.session.submit('E');
    expect(lines(t.history).map((l) => l.id)).toEqual(['l1']);
    expect(t.session.snapshot.activeTool).toBeNull();
    t.history.undo();
    expect(lines(t.history).map((l) => l.id)).toEqual(['l0', 'l1', 'l2']); // order restored
  });

  it('without a selection, selects then erases on Enter', () => {
    const t = setup(2);
    t.session.submit('E');
    expect(t.session.wantsSelection).toBe(true);
    t.select('l1');
    t.session.submit('');
    expect(lines(t.history).map((l) => l.id)).toEqual(['l0']);
  });

  it('mouse clicks during a select step are ignored by the tool (the app selects instead)', () => {
    const t = setup(1);
    t.session.submit('M');
    t.session.point([5, 5]);
    expect(t.session.snapshot.prompt).toBe('MOVE Select objects, then press Enter:');
  });
});
