import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { closestPointOnSegment, distance, type Vec2 } from '../src/index.ts';

const coord = fc.double({ min: -1e5, max: 1e5, noNaN: true });
const vec = fc.tuple(coord, coord) as fc.Arbitrary<Vec2>;

describe('geom2d', () => {
  it('distance is symmetric and non-negative', () => {
    fc.assert(fc.property(vec, vec, (a, b) => {
      expect(distance(a, b)).toBeGreaterThanOrEqual(0);
      expect(distance(a, b)).toBe(distance(b, a));
    }));
  });

  it('closest point is never farther than either endpoint', () => {
    fc.assert(fc.property(vec, vec, vec, (p, a, b) => {
      const c = closestPointOnSegment(p, { start: a, end: b });
      const d = distance(p, c);
      expect(d).toBeLessThanOrEqual(distance(p, a) + 1e-6);
      expect(d).toBeLessThanOrEqual(distance(p, b) + 1e-6);
    }));
  });
});
