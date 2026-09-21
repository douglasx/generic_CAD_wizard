import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseInput, pointAlong } from '../src/commands/parse.ts';

const pt = (x: unknown) => (x as { point: [number, number] }).point;

describe('parseInput (REQ-003.2)', () => {
  it('absolute cartesian, with spaces, signs, decimals and exponents', () => {
    expect(parseInput('100,50', null)).toEqual({ kind: 'point', point: [100, 50] });
    expect(parseInput('  -12.5 , .25 ', null)).toEqual({ kind: 'point', point: [-12.5, 0.25] });
    expect(parseInput('1e3,-2E-1', null)).toEqual({ kind: 'point', point: [1000, -0.2] });
  });

  it('relative cartesian needs a previous point', () => {
    expect(parseInput('@10,-5', [100, 100])).toEqual({ kind: 'point', point: [110, 95] });
    expect(parseInput('@10,5', null)).toMatchObject({ kind: 'error' });
  });

  it('polar, relative and absolute, degrees counter-clockwise', () => {
    const r = pt(parseInput('@100<90', [10, 10]));
    expect(r[0]).toBeCloseTo(10, 9);
    expect(r[1]).toBeCloseTo(110, 9);
    const a = pt(parseInput('50<180', null));
    expect(a[0]).toBeCloseTo(-50, 9);
    expect(a[1]).toBeCloseTo(0, 9);
    const neg = pt(parseInput('@10<-90', [0, 0]));
    expect(neg[1]).toBeCloseTo(-10, 9);
  });

  it('bare numbers are distances, words are upper-cased keywords, blank is Enter', () => {
    expect(parseInput('120', null)).toEqual({ kind: 'distance', value: 120 });
    expect(parseInput('c', null)).toEqual({ kind: 'word', value: 'C' });
    expect(parseInput('pl', null)).toEqual({ kind: 'word', value: 'PL' });
    expect(parseInput('   ', null)).toEqual({ kind: 'enter' });
  });

  it('rejects malformed input', () => {
    for (const bad of ['10,', ',5', '10,,5', '@', '10<', '1,2,3', '#']) {
      expect(parseInput(bad, [0, 0]).kind).toBe('error');
    }
  });

  it('property: @d<a lands exactly d away from the last point', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e5, noNaN: true }),
        fc.double({ min: -720, max: 720, noNaN: true }),
        fc.tuple(fc.double({ min: -1e5, max: 1e5, noNaN: true }), fc.double({ min: -1e5, max: 1e5, noNaN: true })),
        (d, a, base) => {
          const p = pt(parseInput(`@${d}<${a}`, base));
          expect(Math.hypot(p[0] - base[0], p[1] - base[1])).toBeCloseTo(d, 5);
        },
      ),
    );
  });
});

describe('pointAlong', () => {
  it('moves the given distance toward the cursor', () => {
    expect(pointAlong([0, 0], [3, 4], 10)).toEqual([6, 8]);
    expect(pointAlong([1, 1], [1, 1], 5)).toBeNull();
  });
});
