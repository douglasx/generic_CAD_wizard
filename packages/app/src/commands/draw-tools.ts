import { addEntity, deleteEntity, type EntityId, type Vec3 } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';
import { PREVIEW_ID, type ToolDefinition } from './tool.ts';

const v3 = (p: Vec2): Vec3 => [p[0], p[1], 0];
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9;

// ---------------------------------------------------------------- LINE

interface LineState {
  readonly first: Vec2 | null;
  readonly current: Vec2 | null;
  /** Segments drawn in this run, for Undo and Close. */
  readonly segments: readonly { id: EntityId; start: Vec2 }[];
}

/**
 * LINE (L): chains independent line segments, like AutoCAD.
 * Options: Close (back to the first point, needs 2+ segments), Undo (last segment).
 */
export const lineTool: ToolDefinition<LineState> = {
  name: 'LINE',
  label: 'Line',
  aliases: ['L'],
  init: () => ({ first: null, current: null, segments: [] }),
  prompt(s) {
    if (!s.current) return 'LINE Specify first point:';
    const opts = s.segments.length >= 2 ? '[Close/Undo]' : '[Undo]';
    return `LINE Specify next point or ${opts}:`;
  },
  lastPoint: (s) => s.current,
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type === 'number') return { state: s, error: 'Expected a point' };
    if (input.type === 'word') {
      if (input.value === 'U' || input.value === 'UNDO') {
        const last = s.segments[s.segments.length - 1];
        if (!last) return { state: s, error: 'Nothing to undo' };
        const segments = s.segments.slice(0, -1);
        return {
          state: { ...s, segments, current: last.start, first: segments.length === 0 ? last.start : s.first },
          commands: [deleteEntity(last.id)],
        };
      }
      if ((input.value === 'C' || input.value === 'CLOSE') && s.segments.length >= 2 && s.first && s.current) {
        const id = ctx.newId('line');
        return {
          state: s,
          commands: [addEntity({ id, kind: 'line', layer: ctx.doc.currentLayer, start: v3(s.current), end: v3(s.first) })],
          done: true,
        };
      }
      return { state: s, error: `Invalid option ${input.value}` };
    }
    const p = input.point;
    if (!s.current) return { state: { ...s, first: p, current: p } };
    if (same(p, s.current)) return { state: s, error: 'Zero-length line ignored' };
    const id = ctx.newId('line');
    return {
      state: { ...s, current: p, segments: [...s.segments, { id, start: s.current }] },
      commands: [addEntity({ id, kind: 'line', layer: ctx.doc.currentLayer, start: v3(s.current), end: v3(p) })],
    };
  },
  preview(s, cursor, ctx) {
    if (!s.current) return [];
    return [{ id: PREVIEW_ID, kind: 'line', layer: ctx.doc.currentLayer, start: v3(s.current), end: v3(cursor) }];
  },
};

// ---------------------------------------------------------------- PLINE

interface PlineState {
  readonly points: readonly Vec2[];
}

/**
 * PLINE (PL): one polyline entity, committed on Enter or Close.
 * Options: Close, Undo (last vertex).
 */
export const polylineTool: ToolDefinition<PlineState> = {
  name: 'PLINE',
  label: 'Polyline',
  aliases: ['PL'],
  init: () => ({ points: [] }),
  prompt(s) {
    if (s.points.length === 0) return 'PLINE Specify start point:';
    const opts = s.points.length >= 3 ? '[Close/Undo]' : '[Undo]';
    return `PLINE Specify next point or ${opts}:`;
  },
  lastPoint: (s) => s.points[s.points.length - 1] ?? null,
  handle(s, input, ctx) {
    const commit = (closed: boolean) => ({
      state: s,
      commands:
        s.points.length >= 2
          ? [
              addEntity({
                id: ctx.newId('pline'),
                kind: 'polyline' as const,
                layer: ctx.doc.currentLayer,
                points: s.points.map(v3),
                closed,
              }),
            ]
          : [],
      done: true,
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
    return [{ id: PREVIEW_ID, kind: 'polyline', layer: ctx.doc.currentLayer, points: [...s.points, cursor].map(v3), closed: false }];
  },
};

import { arcTool } from './tools/arc.ts';
import { circleTool } from './tools/circle.ts';
import { ellipseTool } from './tools/ellipse.ts';
import { splineTool } from './tools/spline.ts';

export const DRAW_TOOLS = [lineTool, polylineTool, arcTool, circleTool, ellipseTool, splineTool];

export { MODIFY_TOOLS } from './tools/modify.ts';
