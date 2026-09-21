import { describe, expect, it } from 'vitest';
import { addEntity, createDocument, entityList, History, sequentialIds, type ArcEntity, type Entity, type EntityId, type LineEntity } from '@cadw/core';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS, MODIFY_TOOLS } from '../src/commands/draw-tools.ts';

function setup(ents: Entity[]) {
  const history = new History(createDocument());
  for (const e of ents) history.execute(addEntity(e));
  const session = new CommandSession(history, sequentialIds(), [...DRAW_TOOLS, ...MODIFY_TOOLS]);
  session.setPickRadius(3);
  return { history, session };
}
const L = (id: string, a: [number, number], b: [number, number]): LineEntity => ({ id: id as EntityId, kind: 'line', layer: '0', start: [a[0], a[1], 0], end: [b[0], b[1], 0] });

describe('TRIM tool', () => {
  it('each pick trims and is one undo step; the kept piece keeps the original id', () => {
    const { history, session } = setup([L('h', [0, 0], [100, 0]), L('v1', [30, -10], [30, 10]), L('v2', [70, -10], [70, 10])]);
    session.submit('TR');
    session.point([50, 1]);
    const hs = entityList(history.doc).filter((e) => e.kind === 'line' && (e as LineEntity).start[1] === 0) as LineEntity[];
    expect(hs.map((e) => [e.start[0], e.end[0]]).sort()).toEqual([[0, 30], [70, 100]]);
    expect(history.doc.entities['h']).toBeDefined();
    session.point([30, 8]); // trim the top of v1 (above h)
    expect((history.doc.entities['v1'] as LineEntity).end).toEqual([30, 0, 0]);
    session.submit('');
    history.undo();
    expect((history.doc.entities['v1'] as LineEntity).end).toEqual([30, 10, 0]);
  });

  it('reports picks on nothing and on uncut objects, and keeps running', () => {
    const { session } = setup([L('h', [0, 0], [100, 0])]);
    session.submit('TR');
    session.point([50, 50]);
    expect(session.snapshot.log.at(-1)).toBe('No object there');
    session.point([50, 0]);
    expect(session.snapshot.log.at(-1)).toMatch(/nothing to trim/);
    expect(session.snapshot.activeTool).toBe('TRIM');
  });

  it('previews the part that would be removed', () => {
    const { session } = setup([L('h', [0, 0], [100, 0]), L('v', [30, -10], [30, 10])]);
    session.submit('TR');
    const [p] = session.preview([80, 0]) as LineEntity[];
    expect(p!.start).toEqual([30, 0, 0]);
    expect(p!.end).toEqual([100, 0, 0]);
  });

  it('is marked as a pick tool, so the app sends raw clicks', () => {
    const { session } = setup([]);
    session.submit('TR');
    expect(session.wantsPick).toBe(true);
  });
});

describe('EXTEND tool', () => {
  it('extends to the nearest boundary', () => {
    const { history, session } = setup([L('a', [0, 0], [40, 0]), L('b', [90, -10], [90, 10])]);
    session.submit('EX');
    session.point([38, 0]);
    expect((history.doc.entities['a'] as LineEntity).end).toEqual([90, 0, 0]);
  });
});

describe('OFFSET tool', () => {
  it('distance, then object and side, repeatedly; distance is remembered', () => {
    const { history, session } = setup([L('a', [0, 0], [100, 0])]);
    for (const x of ['O', '12']) session.submit(x);
    session.point([50, 0]);
    session.point([50, 40]);
    session.point([50, 12]); // pick the new offset line
    session.point([50, 40]);
    session.submit('');
    const ys = entityList(history.doc).map((e) => (e as LineEntity).start[1]).sort((a, b) => a - b);
    expect(ys).toEqual([0, 12, 24]);
    session.submit('O');
    expect(session.snapshot.prompt).toBe('OFFSET Specify offset distance <12>:');
  });

  it('offsets an arc outward', () => {
    const arc: ArcEntity = { id: 'c' as EntityId, kind: 'arc', layer: '0', center: [0, 0, 0], radius: 20, startAngle: 0, endAngle: Math.PI };
    const { history, session } = setup([arc]);
    for (const x of ['O', '5']) session.submit(x);
    session.point([0, 20]);
    session.point([0, 40]);
    expect((entityList(history.doc)[1] as ArcEntity).radius).toBe(25);
  });
});
