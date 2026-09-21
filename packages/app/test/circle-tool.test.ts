import { describe, expect, it } from 'vitest';
import { createDocument, entityList, History, sequentialIds, type CircleEntity } from '@cadw/core';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';

function run(inputs: string[], cursor: [number, number] | null = null) {
  const history = new History(createDocument());
  const session = new CommandSession(history, sequentialIds(), DRAW_TOOLS);
  for (const i of inputs) session.submit(i, cursor);
  return { circles: entityList(history.doc) as CircleEntity[], session };
}

describe('CIRCLE tool (REQ-003.1)', () => {
  it('centre, then a typed radius', () => {
    const { circles } = run(['C', '10,20', '35'], [500, 500]);
    expect(circles[0]).toMatchObject({ kind: 'circle', center: [10, 20, 0] });
    expect(circles[0]!.radius).toBeCloseTo(35, 9);
  });

  it('typed radius works even with the cursor on the centre or absent', () => {
    expect(run(['C', '0,0', '40'], [0, 0]).circles[0]!.radius).toBeCloseTo(40, 9);
    expect(run(['C', '0,0', '40'], null).circles[0]!.radius).toBeCloseTo(40, 9);
  });

  it('centre, then a radius point', () => {
    const { circles } = run(['C', '0,0', '@30<60']);
    expect(circles[0]!.radius).toBeCloseTo(30, 9);
  });

  it('2P: diameter end points', () => {
    const { circles } = run(['C', '2p', '0,0', '100,0']);
    expect(circles[0]!.center).toEqual([50, 0, 0]);
    expect(circles[0]!.radius).toBeCloseTo(50, 9);
  });

  it('rejects zero radius and keeps asking', () => {
    const { circles, session } = run(['C', '5,5', '5,5']);
    expect(circles).toHaveLength(0);
    expect(session.snapshot.prompt).toBe('CIRCLE Specify radius:');
  });

  it('C is the circle alias, not an option, at the idle prompt', () => {
    const { session } = run(['c']);
    expect(session.snapshot.activeTool).toBe('CIRCLE');
  });
});
