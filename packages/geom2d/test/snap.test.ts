import { describe, expect, it } from 'vitest';
import type { Entity, EntityId } from '@cadw/core';
import { ALL_SNAP_KINDS, findObjectSnap, type SnapKind, type Vec2 } from '../src/index.ts';

let n = 0;
const e = (kind: string, rest: Record<string, unknown>): Entity => ({ id: `e${n++}` as EntityId, layer: '0', kind, ...rest }) as Entity;
const line = (a: Vec2, b: Vec2) => e('line', { start: [a[0], a[1], 0], end: [b[0], b[1], 0] });
const all = new Set(ALL_SNAP_KINDS);
const only = (...k: SnapKind[]) => new Set(k);
const snap = (cursor: Vec2, ents: Entity[], enabled: ReadonlySet<SnapKind> = all, from: Vec2 | null = null, radius = 5) =>
  findObjectSnap(cursor, ents, { enabled, radius, from, tolerance: 0.001 });

const near = (p: Vec2 | undefined, q: Vec2) => {
  expect(p).toBeDefined();
  expect(p![0]).toBeCloseTo(q[0], 6);
  expect(p![1]).toBeCloseTo(q[1], 6);
};

describe('findObjectSnap (REQ-003.3)', () => {
  it('endpoint and midpoint of a line', () => {
    const l = line([0, 0], [100, 0]);
    expect(snap([98, 2], [l])).toMatchObject({ kind: 'endpoint', point: [100, 0] });
    expect(snap([51, 1], [l])).toMatchObject({ kind: 'midpoint', point: [50, 0] });
  });

  it('polyline vertices are endpoints; each segment has a midpoint', () => {
    const pl = e('polyline', { points: [[0, 0, 0], [100, 0, 0], [100, 100, 0]], closed: false });
    expect(snap([99, 1], [pl])).toMatchObject({ kind: 'endpoint', point: [100, 0] });
    expect(snap([101, 49], [pl])).toMatchObject({ kind: 'midpoint', point: [100, 50] });
  });

  it('centre: near the centre point, or hovering the curve', () => {
    const c = e('circle', { center: [0, 0, 0], radius: 50 });
    expect(snap([1, 1], [c])).toMatchObject({ kind: 'center', point: [0, 0] });
    // On the curve but away from any quadrant, centre is offered.
    expect(snap([35.5, 35.2], [c], only('center'))).toMatchObject({ kind: 'center', point: [0, 0] });
  });

  it('quadrants of a circle, an arc (only within its sweep) and an ellipse', () => {
    const c = e('circle', { center: [0, 0, 0], radius: 50 });
    near(snap([2, 49], [c])?.point, [0, 50]);
    expect(snap([2, 49], [c])?.kind).toBe('quadrant');
    const arc = e('arc', { center: [0, 0, 0], radius: 50, startAngle: 0, endAngle: Math.PI / 4 });
    expect(snap([1, 49], [arc], only('quadrant'))).toBeNull();
    const el = e('ellipse', { center: [0, 0, 0], majorAxis: [80, 0, 0], ratio: 0.5 });
    near(snap([1, 39], [el], only('quadrant'))?.point, [0, 40]);
  });

  it('intersection of two lines, and of a line with a circle', () => {
    const a = line([0, 0], [100, 100]);
    const b = line([0, 100], [100, 0]);
    expect(snap([52, 49], [a, b])).toMatchObject({ kind: 'intersection', point: [50, 50] });
    const c = e('circle', { center: [0, 0, 0], radius: 50 });
    const h = line([-100, 30], [100, 30]);
    const s = snap([41, 31], [c, h], only('intersection'));
    near(s?.point, [40, 30]);
  });

  it('perpendicular from the tool base point', () => {
    const l = line([0, 0], [100, 0]);
    const s = snap([31, 3], [l], all, [30, 40]);
    expect(s).toMatchObject({ kind: 'perpendicular', point: [30, 0] });
    expect(snap([31, 3], [l], all, null)?.kind).toBe('nearest'); // no base point, no perpendicular
  });

  it('nearest is the fallback anywhere on a curve', () => {
    const l = line([0, 0], [100, 0]);
    expect(snap([33, 2], [l])).toMatchObject({ kind: 'nearest', point: [33, 0] });
    const sp = e('spline', { points: [[0, 0, 0], [50, 50, 0], [100, 0, 0]], closed: false });
    expect(snap([50, 51], [sp])?.kind).toBe('nearest');
  });

  it('point snaps beat nearest even when the cursor is exactly on the curve', () => {
    const l = line([0, 0], [100, 0]);
    expect(snap([97, 0], [l])).toMatchObject({ kind: 'endpoint' });
  });

  it('respects the enabled set, the aperture and an empty set', () => {
    const l = line([0, 0], [100, 0]);
    expect(snap([98, 2], [l], only('midpoint'))).toBeNull();
    expect(snap([90, 2], [l], only('endpoint'))).toBeNull(); // 10 away, aperture 5
    expect(snap([98, 2], [l], new Set())).toBeNull();
  });
});
