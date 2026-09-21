import { describe, expect, it } from 'vitest';
import { createDocument, entityList, History, sequentialIds, type ArcEntity } from '@cadw/core';
import { sweep } from '@cadw/geom2d';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';

function run(...inputs: string[]) {
  const history = new History(createDocument());
  const session = new CommandSession(history, sequentialIds(), DRAW_TOOLS);
  for (const i of inputs) session.submit(i);
  return { arcs: entityList(history.doc) as ArcEntity[], session };
}

describe('ARC tool (REQ-003.1)', () => {
  it('3-point, counter-clockwise pick', () => {
    const { arcs } = run('A', '10,0', '0,10', '-10,0');
    expect(arcs).toHaveLength(1);
    const a = arcs[0]!;
    expect(a.radius).toBeCloseTo(10, 9);
    expect(a.startAngle).toBeCloseTo(0, 9);
    expect(sweep(a.startAngle, a.endAngle)).toBeCloseTo(Math.PI, 9);
  });

  it('3-point, clockwise pick is stored as the same arc, counter-clockwise', () => {
    const { arcs } = run('A', '-10,0', '0,10', '10,0');
    const a = arcs[0]!;
    expect(a.startAngle).toBeCloseTo(0, 9); // starts at (10,0)
    expect(sweep(a.startAngle, a.endAngle)).toBeCloseTo(Math.PI, 9); // over the top
  });

  it('start → C → centre → end sweeps counter-clockwise to the end angle', () => {
    const { arcs } = run('A', '10,0', 'c', '0,0', '0,-50');
    const a = arcs[0]!;
    expect(a.radius).toBeCloseTo(10, 9);
    expect(sweep(a.startAngle, a.endAngle)).toBeCloseTo((3 * Math.PI) / 2, 9);
  });

  it('C first: centre → start → end', () => {
    const { arcs } = run('A', 'C', '0,0', '@20<0', '0,5');
    expect(arcs[0]!.radius).toBeCloseTo(20, 9);
    expect(sweep(arcs[0]!.startAngle, arcs[0]!.endAngle)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('refuses collinear points and keeps waiting for a valid end point', () => {
    const { arcs, session } = run('A', '0,0', '5,0', '10,0');
    expect(arcs).toHaveLength(0);
    expect(session.snapshot.log.at(-1)).toMatch(/in a line/);
    expect(session.snapshot.activeTool).toBe('ARC');
  });

  it('previews the arc while picking the end point', () => {
    const { session } = run('A', '10,0', '0,10');
    const [p] = session.preview([-10, 0]) as ArcEntity[];
    expect(p!.kind).toBe('arc');
    expect(p!.radius).toBeCloseTo(10, 9);
  });
});
