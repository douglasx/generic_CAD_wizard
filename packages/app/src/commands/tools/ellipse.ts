import { addEntity, type EllipseEntity } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';
import { PREVIEW_ID, type ToolDefinition } from '../tool.ts';

/**
 * ELLIPSE (EL), REQ-003.1, centre-axes method:
 *   centre → end point of the first axis → distance to the other axis
 * The other-axis distance is measured from the centre (a point or a typed
 * number). If it exceeds the first axis, the axes swap so the stored
 * `majorAxis` is always the longer one and `ratio` stays in (0, 1] (ADR 0008).
 */
type EllipseState =
  | { readonly step: 'center' }
  | { readonly step: 'axis'; readonly center: Vec2 }
  | { readonly step: 'other'; readonly center: Vec2; readonly axis: Vec2 };

const len = (v: Vec2) => Math.hypot(v[0], v[1]);

/** Ellipse from centre, first-axis vector and the other semi-axis length. */
export function ellipseFrom(center: Vec2, axis: Vec2, other: number): Omit<EllipseEntity, 'id' | 'layer' | 'kind'> | null {
  const a = len(axis);
  if (a <= 1e-9 || other <= 1e-9) return null;
  if (other <= a) return { center: [center[0], center[1], 0], majorAxis: [axis[0], axis[1], 0], ratio: other / a };
  // Swap: the perpendicular axis is the major one.
  const perp: Vec2 = [(-axis[1] / a) * other, (axis[0] / a) * other];
  return { center: [center[0], center[1], 0], majorAxis: [perp[0], perp[1], 0], ratio: a / other };
}

export const ellipseTool: ToolDefinition<EllipseState> = {
  name: 'ELLIPSE',
  label: 'Ellipse',
  aliases: ['EL'],
  init: () => ({ step: 'center' }),
  prompt(s) {
    if (s.step === 'center') return 'ELLIPSE Specify center of ellipse:';
    if (s.step === 'axis') return 'ELLIPSE Specify endpoint of axis:';
    return 'ELLIPSE Specify distance to other axis:';
  },
  lastPoint: (s) => (s.step === 'center' ? null : s.center),
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type === 'word') return { state: s, error: `Invalid option ${input.value}` };
    const p = input.point;
    if (s.step === 'center') return { state: { step: 'axis', center: p } };
    if (s.step === 'axis') {
      const axis: Vec2 = [p[0] - s.center[0], p[1] - s.center[1]];
      if (len(axis) <= 1e-9) return { state: s, error: 'Axis end point must differ from the centre' };
      return { state: { step: 'other', center: s.center, axis } };
    }
    const geom = ellipseFrom(s.center, s.axis, Math.hypot(p[0] - s.center[0], p[1] - s.center[1]));
    if (!geom) return { state: s, error: 'Distance must be greater than zero' };
    return {
      state: s,
      done: true,
      commands: [addEntity({ id: ctx.newId('ellipse'), kind: 'ellipse', layer: ctx.doc.currentLayer, ...geom })],
    };
  },
  preview(s, cursor, ctx) {
    const base = { id: PREVIEW_ID, layer: ctx.doc.currentLayer };
    if (s.step === 'axis') return [{ ...base, kind: 'line', start: [s.center[0], s.center[1], 0], end: [cursor[0], cursor[1], 0] }];
    if (s.step === 'other') {
      const geom = ellipseFrom(s.center, s.axis, Math.hypot(cursor[0] - s.center[0], cursor[1] - s.center[1]));
      return geom ? [{ ...base, kind: 'ellipse', ...geom }] : [];
    }
    return [];
  },
};
