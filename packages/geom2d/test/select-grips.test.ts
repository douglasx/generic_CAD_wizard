import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ArcEntity, CircleEntity, EllipseEntity, Entity, EntityId, LineEntity } from '@cadw/core';
import { boxFrom, crossingSelect, entityBounds, gripsOf, moveGrip, pickEntity, sweep, windowSelect, type Vec2 } from '../src/index.ts';

let n = 0;
const e = <T extends Entity>(kind: T['kind'], rest: Omit<T, 'id' | 'layer' | 'kind'>): T => ({ id: `s${n++}` as EntityId, layer: '0', kind, ...rest }) as T;
const line = (a: Vec2, b: Vec2) => e<LineEntity>('line', { start: [a[0], a[1], 0], end: [b[0], b[1], 0] });
const TOL = 0.01;

describe('selection (REQ-003.5)', () => {
  const l1 = line([0, 0], [100, 0]);
  const l2 = line([50, -50], [50, 50]);
  const c = e<CircleEntity>('circle', { center: [300, 0, 0], radius: 40 });
  const all = [l1, l2, c];

  it('pick: nearest curve within the aperture, else nothing', () => {
    expect(pickEntity([20, 2], all, 5, TOL)).toBe(l1.id);
    expect(pickEntity([51, 30], all, 5, TOL)).toBe(l2.id);
    expect(pickEntity([339, 1], all, 5, TOL)).toBe(c.id);
    expect(pickEntity([300, 0], all, 5, TOL)).toBeNull(); // circle centre is not on the curve
  });

  it('window selects only entities entirely inside', () => {
    expect(windowSelect(boxFrom([-10, -10], [110, 10]), all, TOL)).toEqual([l1.id]);
    expect(windowSelect(boxFrom([-10, -60], [400, 60]), all, TOL).sort()).toEqual([l1.id, l2.id, c.id].sort());
  });

  it('crossing selects anything touching, including a box inside a circle’s bounds that cuts its curve', () => {
    expect(crossingSelect(boxFrom([40, -10], [60, 10]), all, TOL).sort()).toEqual([l1.id, l2.id].sort());
    expect(crossingSelect(boxFrom([330, -5], [350, 5]), all, TOL)).toEqual([c.id]);
    expect(crossingSelect(boxFrom([290, -5], [310, 5]), all, TOL)).toEqual([]); // inside the circle, touching nothing
  });

  it('property: window ⊆ crossing for the same box', () => {
    fc.assert(
      fc.property(fc.double({ min: -100, max: 400, noNaN: true }), fc.double({ min: -100, max: 100, noNaN: true }), fc.double({ min: -100, max: 400, noNaN: true }), fc.double({ min: -100, max: 100, noNaN: true }), (x0, y0, x1, y1) => {
        const box = boxFrom([x0, y0], [x1, y1]);
        const cross = new Set(crossingSelect(box, all, TOL));
        for (const id of windowSelect(box, all, TOL)) expect(cross.has(id)).toBe(true);
      }),
    );
  });
});

describe('grips (REQ-003.7)', () => {
  it('line: end grips reshape, middle grip moves', () => {
    const l = line([0, 0], [100, 0]);
    expect(gripsOf(l).map((g) => g.point)).toEqual([[0, 0], [50, 0], [100, 0]]);
    expect(moveGrip(l, 2, [100, 40])).toMatchObject({ start: [0, 0, 0], end: [100, 40, 0] });
    expect(moveGrip(l, 1, [60, 10])).toMatchObject({ start: [10, 10, 0], end: [110, 10, 0] });
    expect(moveGrip(l, 0, [100, 0])).toBeNull(); // zero length
  });

  it('circle: quadrant grip sets the radius, centre grip moves', () => {
    const c = e<CircleEntity>('circle', { center: [0, 0, 0], radius: 10 });
    expect(gripsOf(c)).toHaveLength(5);
    expect((moveGrip(c, 1, [0, 25]) as CircleEntity).radius).toBeCloseTo(25, 12);
    expect(moveGrip(c, 0, [5, 5])).toMatchObject({ center: [5, 5, 0], radius: 10 });
  });

  it('arc: dragging the mid grip keeps both ends', () => {
    const a = e<ArcEntity>('arc', { center: [0, 0, 0], radius: 10, startAngle: 0, endAngle: Math.PI });
    const next = moveGrip(a, 1, [0, 20]) as ArcEntity;
    const [s, , en] = gripsOf(next);
    expect(s!.point[0]).toBeCloseTo(10, 9);
    expect(en!.point[0]).toBeCloseTo(-10, 9);
    expect(next.radius).toBeGreaterThan(10);
    expect(sweep(next.startAngle, next.endAngle)).toBeGreaterThan(Math.PI);
    expect(moveGrip(a, 1, [0, 0])).toBeNull(); // collinear with the ends
  });

  it('ellipse: major and minor grips resize; axes swap past each other', () => {
    const el = e<EllipseEntity>('ellipse', { center: [0, 0, 0], majorAxis: [40, 0, 0], ratio: 0.5 });
    const wider = moveGrip(el, 1, [60, 0]) as EllipseEntity;
    expect(wider.majorAxis[0]).toBeCloseTo(60, 9);
    expect(wider.ratio * 60).toBeCloseTo(20, 9); // minor unchanged
    const taller = moveGrip(el, 3, [0, 80]) as EllipseEntity;
    expect(Math.hypot(taller.majorAxis[0], taller.majorAxis[1])).toBeCloseTo(80, 9);
    expect(taller.ratio).toBeCloseTo(0.5, 9); // 40 / 80
  });

  it('property: moving any grip onto itself leaves the entity unchanged in shape', () => {
    const samples: Entity[] = [
      line([3, 4], [50, -7]),
      e<CircleEntity>('circle', { center: [1, 2, 0], radius: 9 }),
      e<ArcEntity>('arc', { center: [0, 0, 0], radius: 12, startAngle: 0.3, endAngle: 2.2 }),
      e<EllipseEntity>('ellipse', { center: [5, 5, 0], majorAxis: [30, 10, 0], ratio: 0.4 }),
    ];
    for (const s of samples) {
      for (const g of gripsOf(s)) {
        const next = moveGrip(s, g.index, g.point)!;
        const b0 = entityBounds(s, TOL)!;
        const b1 = entityBounds(next, TOL)!;
        for (let k = 0; k < 2; k++) {
          expect(b1.min[k]).toBeCloseTo(b0.min[k]!, 6);
          expect(b1.max[k]).toBeCloseTo(b0.max[k]!, 6);
        }
      }
    }
  });
});
