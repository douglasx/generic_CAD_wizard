import { addEntity } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';
import { PREVIEW_ID, type ToolDefinition } from '../tool.ts';

/**
 * CIRCLE (C), REQ-003.1:
 *   centre → radius (a point, or a typed number)
 *   2P → first end of diameter → second end of diameter
 */
type CircleState =
  | { readonly step: 'center' }
  | { readonly step: 'radius'; readonly center: Vec2 }
  | { readonly step: 'diam1' }
  | { readonly step: 'diam2'; readonly first: Vec2 };

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export const circleTool: ToolDefinition<CircleState> = {
  name: 'CIRCLE',
  label: 'Circle',
  aliases: ['C'],
  init: () => ({ step: 'center' }),
  prompt(s) {
    switch (s.step) {
      case 'center':
        return 'CIRCLE Specify center point or [2P]:';
      case 'radius':
        return 'CIRCLE Specify radius:';
      case 'diam1':
        return 'CIRCLE Specify first end point of diameter:';
      case 'diam2':
        return 'CIRCLE Specify second end point of diameter:';
    }
  },
  // A typed bare number becomes a point that far from here, i.e. the radius.
  lastPoint: (s) => (s.step === 'radius' ? s.center : s.step === 'diam2' ? s.first : null),
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type === 'number') return { state: s, error: 'Expected a point' };
    if (input.type === 'word') {
      if (s.step === 'center' && input.value === '2P') return { state: { step: 'diam1' } };
      return { state: s, error: `Invalid option ${input.value}` };
    }
    const p = input.point;
    const add = (center: Vec2, radius: number) => ({
      state: s,
      done: true,
      commands: [addEntity({ id: ctx.newId('circle'), kind: 'circle', layer: ctx.doc.currentLayer, center: [center[0], center[1], 0], radius })],
    });
    switch (s.step) {
      case 'center':
        return { state: { step: 'radius', center: p } };
      case 'radius': {
        const r = dist(s.center, p);
        return r > 1e-9 ? add(s.center, r) : { state: s, error: 'Radius must be greater than zero' };
      }
      case 'diam1':
        return { state: { step: 'diam2', first: p } };
      case 'diam2': {
        const d = dist(s.first, p);
        return d > 1e-9 ? add(mid(s.first, p), d / 2) : { state: s, error: 'Diameter must be greater than zero' };
      }
    }
  },
  preview(s, cursor, ctx) {
    const base = { id: PREVIEW_ID, layer: ctx.doc.currentLayer, kind: 'circle' as const };
    if (s.step === 'radius' && dist(s.center, cursor) > 1e-9)
      return [{ ...base, center: [s.center[0], s.center[1], 0], radius: dist(s.center, cursor) }];
    if (s.step === 'diam2' && dist(s.first, cursor) > 1e-9) {
      const c = mid(s.first, cursor);
      return [{ ...base, center: [c[0], c[1], 0], radius: dist(s.first, cursor) / 2 }];
    }
    return [];
  },
};
