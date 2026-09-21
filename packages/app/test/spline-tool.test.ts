import { describe, expect, it } from 'vitest';
import { createDocument, entityList, History, sequentialIds, type SplineEntity } from '@cadw/core';
import { flattenEntity } from '@cadw/geom2d';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';

function run(inputs: string[]) {
  const history = new History(createDocument());
  const session = new CommandSession(history, sequentialIds(), DRAW_TOOLS);
  for (const i of inputs) session.submit(i);
  return { splines: entityList(history.doc) as SplineEntity[], session };
}

describe('SPLINE tool (REQ-003.1)', () => {
  it('fits through every picked point; Enter finishes', () => {
    const { splines } = run(['SPL', '0,0', '50,40', '100,-10', '150,30', '']);
    const s = splines[0]!;
    expect(s.points).toHaveLength(4);
    expect(s.closed).toBe(false);
    const curve = flattenEntity(s, 0.01);
    for (const fit of s.points) {
      expect(Math.min(...curve.map((p) => Math.hypot(p[0] - fit[0], p[1] - fit[1])))).toBeLessThan(1e-9);
    }
  });

  it('Close makes a closed loop; Undo drops the last point', () => {
    const { splines } = run(['SPL', '0,0', '100,0', '999,999', 'u', '100,100', '0,100', 'c']);
    expect(splines[0]!.closed).toBe(true);
    expect(splines[0]!.points).toHaveLength(4);
  });

  it('offers Close only with 3+ points and adds nothing with fewer than 2', () => {
    const r = run(['SPL', '0,0', '10,0']);
    expect(r.session.snapshot.prompt).not.toContain('Close');
    r.session.submit('C');
    expect(r.session.snapshot.log.at(-1)).toMatch(/Invalid option C/);
    expect(run(['SPL', '5,5', '']).splines).toHaveLength(0);
  });
});
