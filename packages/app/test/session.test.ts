import { describe, expect, it } from 'vitest';
import { createDocument, DEFAULT_LAYER, entityList, History, sequentialIds, type CadDocument, type LineEntity, type PolylineEntity } from '@cadw/core';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';

function setup(doc: CadDocument = createDocument()) {
  const history = new History(doc);
  const session = new CommandSession(history, sequentialIds(), DRAW_TOOLS);
  return { history, session };
}

describe('CommandSession (REQ-003.9)', () => {
  it('typed and mouse input produce the identical document', () => {
    const typed = setup();
    typed.session.submit('L');
    for (const t of ['0,0', '@100,0', '@0,50', '']) typed.session.submit(t);

    const mouse = setup();
    mouse.session.run('LINE');
    mouse.session.point([0, 0]);
    mouse.session.point([100, 0]);
    mouse.session.point([100, 50]);
    mouse.session.enter();

    expect(entityList(typed.history.doc)).toHaveLength(2);
    expect(typed.history.doc).toEqual(mouse.history.doc);
  });

  it('prompts for each input, with options once they apply', () => {
    const { session } = setup();
    expect(session.snapshot.prompt).toBe('Command:');
    session.submit('line');
    expect(session.snapshot.prompt).toBe('LINE Specify first point:');
    session.submit('0,0');
    expect(session.snapshot.prompt).toBe('LINE Specify next point or [Undo]:');
    session.submit('10,0');
    session.submit('10,10');
    expect(session.snapshot.prompt).toBe('LINE Specify next point or [Close/Undo]:');
  });

  it('LINE Close adds the closing segment and ends the command', () => {
    const { session, history } = setup();
    session.submit('L');
    for (const t of ['0,0', '100,0', '100,100', 'c']) session.submit(t);
    const lines = entityList(history.doc) as LineEntity[];
    expect(lines).toHaveLength(3);
    expect(lines[2]!.end).toEqual([0, 0, 0]);
    expect(session.snapshot.activeTool).toBeNull();
  });

  it('LINE Undo removes only the last segment and continues from its start', () => {
    const { session, history } = setup();
    session.submit('L');
    for (const t of ['0,0', '100,0', '100,100', 'u']) session.submit(t);
    expect(entityList(history.doc)).toHaveLength(1);
    expect(session.lastPoint).toEqual([100, 0]);
    session.submit('@0,-30');
    expect((entityList(history.doc)[1] as LineEntity).end).toEqual([100, -30, 0]);
  });

  it('PLINE makes one entity; Close marks it closed; Undo drops a vertex', () => {
    const { session, history } = setup();
    session.submit('PL');
    for (const t of ['0,0', '50,0', '99,99', 'u', '50,50', '0,50', 'C']) session.submit(t);
    const [pl] = entityList(history.doc) as PolylineEntity[];
    expect(entityList(history.doc)).toHaveLength(1);
    expect(pl!.closed).toBe(true);
    expect(pl!.points).toEqual([[0, 0, 0], [50, 0, 0], [50, 50, 0], [0, 50, 0]]);
  });

  it('PLINE with fewer than two points adds nothing', () => {
    const { session, history } = setup();
    session.submit('PL');
    session.submit('5,5');
    session.submit('');
    expect(entityList(history.doc)).toHaveLength(0);
  });

  it('Enter at the idle prompt repeats the last command', () => {
    const { session } = setup();
    session.submit('L');
    session.cancel();
    session.submit('');
    expect(session.snapshot.activeTool).toBe('LINE');
  });

  it('a bare distance goes along the cursor direction', () => {
    const { session, history } = setup();
    session.submit('L');
    session.submit('10,10');
    session.submit('25', [10, 1000]); // cursor straight up
    expect((entityList(history.doc)[0] as LineEntity).end).toEqual([10, 35, 0]);
  });

  it('reports unknown commands and bad input without changing the document', () => {
    const { session, history } = setup();
    const before = history.doc;
    session.submit('FOO');
    session.submit('L');
    session.submit('1,2,3');
    session.submit('Q');
    expect(history.doc).toBe(before);
    const log = session.snapshot.log.join('\n');
    expect(log).toContain('Unknown command "FOO"');
    expect(log).toContain('Invalid input: 1,2,3');
    expect(log).toContain('Invalid option Q');
  });

  it('U and REDO at the idle prompt undo and redo', () => {
    const { session, history } = setup();
    session.submit('L');
    for (const t of ['0,0', '1,0', '']) session.submit(t);
    session.submit('u');
    expect(entityList(history.doc)).toHaveLength(0);
    session.submit('redo');
    expect(entityList(history.doc)).toHaveLength(1);
  });

  it('a locked current layer refuses the command and keeps the tool running', () => {
    const doc = createDocument();
    const locked = { ...doc, layers: { '0': { ...DEFAULT_LAYER, locked: true } } };
    const { session, history } = setup(locked);
    session.submit('L');
    session.submit('0,0');
    session.submit('5,0');
    expect(entityList(history.doc)).toHaveLength(0);
    expect(session.snapshot.log.at(-1)).toMatch(/locked/);
    expect(session.snapshot.activeTool).toBe('LINE');
  });

  it('previews a rubber band from the last point to the cursor', () => {
    const { session } = setup();
    session.submit('L');
    expect(session.preview([5, 5])).toEqual([]);
    session.submit('0,0');
    const [p] = session.preview([5, 5]) as LineEntity[];
    expect(p!.end).toEqual([5, 5, 0]);
  });
});
