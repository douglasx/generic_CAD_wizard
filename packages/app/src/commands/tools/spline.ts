import { addEntity, type Vec3 } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';
import { PREVIEW_ID, type ToolDefinition } from '../tool.ts';

/**
 * SPLINE (SPL), REQ-003.1: a smooth curve through picked fit points
 * (centripetal Catmull-Rom, ADR 0008). Enter finishes (2+ points);
 * Close finishes a closed loop (3+ points); Undo drops the last point.
 */
interface SplineState {
  readonly points: readonly Vec2[];
}

const v3 = (p: Vec2): Vec3 => [p[0], p[1], 0];
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9;

export const splineTool: ToolDefinition<SplineState> = {
  name: 'SPLINE',
  label: 'Spline',
  aliases: ['SPL'],
  init: () => ({ points: [] }),
  prompt(s) {
    if (s.points.length === 0) return 'SPLINE Specify first point:';
    if (s.points.length === 1) return 'SPLINE Enter next point or [Undo]:';
    const close = s.points.length >= 3 ? 'Close/' : '';
    return `SPLINE Enter next point or [${close}Undo], Enter to finish:`;
  },
  lastPoint: (s) => s.points[s.points.length - 1] ?? null,
  handle(s, input, ctx) {
    const commit = (closed: boolean) => ({
      state: s,
      done: true,
      commands:
        s.points.length >= 2
          ? [addEntity({ id: ctx.newId('spline'), kind: 'spline' as const, layer: ctx.doc.currentLayer, points: s.points.map(v3), closed })]
          : [],
    });
    if (input.type === 'enter') return commit(false);
    if (input.type === 'number') return { state: s, error: 'Expected a point' };
    if (input.type === 'word') {
      if (input.value === 'U' || input.value === 'UNDO') {
        if (s.points.length === 0) return { state: s, error: 'Nothing to undo' };
        return { state: { points: s.points.slice(0, -1) } };
      }
      if ((input.value === 'C' || input.value === 'CLOSE') && s.points.length >= 3) return commit(true);
      return { state: s, error: `Invalid option ${input.value}` };
    }
    const last = s.points[s.points.length - 1];
    if (last && same(last, input.point)) return { state: s, error: 'Duplicate point ignored' };
    return { state: { points: [...s.points, input.point] } };
  },
  preview(s, cursor, ctx) {
    if (s.points.length === 0) return [];
    return [{ id: PREVIEW_ID, kind: 'spline', layer: ctx.doc.currentLayer, points: [...s.points, cursor].map(v3), closed: false }];
  },
};
