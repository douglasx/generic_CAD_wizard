import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createDocument, entityList, History, sequentialIds, type EllipseEntity } from '@cadw/core';
import { CommandSession } from '../src/commands/session.ts';
import { DRAW_TOOLS } from '../src/commands/draw-tools.ts';
import { ellipseFrom } from '../src/commands/tools/ellipse.ts';

function run(inputs: string[]) {
  const history = new History(createDocument());
  const session = new CommandSession(history, sequentialIds(), DRAW_TOOLS);
  for (const i of inputs) session.submit(i);
  return { ellipses: entityList(history.doc) as EllipseEntity[], session };
}

describe('ELLIPSE tool (REQ-003.1)', () => {
  it('centre → axis end → other-axis distance', () => {
    const { ellipses } = run(['EL', '0,0', '@80<30', '20']);
    const e = ellipses[0]!;
    expect(Math.hypot(e.majorAxis[0], e.majorAxis[1])).toBeCloseTo(80, 9);
    expect(Math.atan2(e.majorAxis[1], e.majorAxis[0])).toBeCloseTo(Math.PI / 6, 9);
    expect(e.ratio).toBeCloseTo(0.25, 9);
  });

  it('swaps axes when the second is longer, keeping ratio ≤ 1', () => {
    const { ellipses } = run(['EL', '0,0', '10,0', '40']);
    const e = ellipses[0]!;
    expect(Math.hypot(e.majorAxis[0], e.majorAxis[1])).toBeCloseTo(40, 9);
    expect(e.majorAxis[0]).toBeCloseTo(0, 9); // now vertical
    expect(e.ratio).toBeCloseTo(0.25, 9);
  });

  it('property: stored semi-axes always match what was picked', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        (a, rot, b) => {
          const g = ellipseFrom([0, 0], [a * Math.cos(rot), a * Math.sin(rot)], b)!;
          const major = Math.hypot(g.majorAxis[0], g.majorAxis[1]);
          expect(g.ratio).toBeLessThanOrEqual(1 + 1e-12);
          expect(major).toBeCloseTo(Math.max(a, b), 6);
          expect(major * g.ratio).toBeCloseTo(Math.min(a, b), 6);
        },
      ),
    );
  });

  it('rejects degenerate axes and keeps asking', () => {
    const { ellipses, session } = run(['EL', '0,0', '0,0']);
    expect(ellipses).toHaveLength(0);
    expect(session.snapshot.prompt).toBe('ELLIPSE Specify endpoint of axis:');
  });
});
