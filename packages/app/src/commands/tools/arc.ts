import { addEntity, type ArcEntity } from '@cadw/core';
import { arcThrough, type Vec2 } from '@cadw/geom2d';
import { PREVIEW_ID, type ToolDefinition } from '../tool.ts';

/**
 * ARC (A), REQ-003.1. Two orders, as in AutoCAD:
 *   3-point:              start → second point → end
 *   start-centre-end:     start → C → centre → end   (or C first: centre → start → end)
 * Arcs are always stored counter-clockwise (ADR 0008); in centre mode the arc
 * sweeps CCW from the start point to the angle of the end point.
 */
type ArcState =
  | { readonly step: 'start'; readonly centerFirst: false }
  | { readonly step: 'second'; readonly start: Vec2 }
  | { readonly step: 'end3p'; readonly start: Vec2; readonly second: Vec2 }
  | { readonly step: 'center'; readonly start: Vec2 | null }
  | { readonly step: 'startAfterCenter'; readonly center: Vec2 }
  | { readonly step: 'endCenter'; readonly start: Vec2; readonly center: Vec2 };

const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-9;
const angle = (from: Vec2, to: Vec2) => Math.atan2(to[1] - from[1], to[0] - from[0]);

function centred(start: Vec2, center: Vec2, end: Vec2): Omit<ArcEntity, 'id' | 'layer' | 'kind'> | null {
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  if (radius <= 1e-9 || same(center, end)) return null;
  return { center: [center[0], center[1], 0], radius, startAngle: angle(center, start), endAngle: angle(center, end) };
}

function threePoint(start: Vec2, second: Vec2, end: Vec2): Omit<ArcEntity, 'id' | 'layer' | 'kind'> | null {
  const a = arcThrough(start, second, end);
  if (!a) return null;
  return { center: [a.center[0], a.center[1], 0], radius: a.radius, startAngle: a.startAngle, endAngle: a.endAngle };
}

export const arcTool: ToolDefinition<ArcState> = {
  name: 'ARC',
  label: 'Arc',
  aliases: ['A'],
  init: () => ({ step: 'start', centerFirst: false }),
  prompt(s) {
    switch (s.step) {
      case 'start':
        return 'ARC Specify start point of arc or [Center]:';
      case 'second':
        return 'ARC Specify second point of arc or [Center]:';
      case 'end3p':
        return 'ARC Specify end point of arc:';
      case 'center':
        return 'ARC Specify center point of arc:';
      case 'startAfterCenter':
        return 'ARC Specify start point of arc:';
      case 'endCenter':
        return 'ARC Specify end point of arc (counter-clockwise):';
    }
  },
  lastPoint(s) {
    switch (s.step) {
      case 'start':
        return null;
      case 'second':
        return s.start;
      case 'end3p':
        return s.second;
      case 'center':
        return s.start;
      case 'startAfterCenter':
      case 'endCenter':
        return s.center;
    }
  },
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type === 'number') return { state: s, error: 'Expected a point' };
    if (input.type === 'word') {
      const isCenter = input.value === 'C' || input.value === 'CENTER' || input.value === 'CE';
      if (isCenter && s.step === 'start') return { state: { step: 'center', start: null } };
      if (isCenter && s.step === 'second') return { state: { step: 'center', start: s.start } };
      return { state: s, error: `Invalid option ${input.value}` };
    }
    const p = input.point;
    const make = (geom: Omit<ArcEntity, 'id' | 'layer' | 'kind'> | null, error: string) =>
      geom
        ? { state: s, done: true, commands: [addEntity({ id: ctx.newId('arc'), kind: 'arc', layer: ctx.doc.currentLayer, ...geom })] }
        : { state: s, error };

    switch (s.step) {
      case 'start':
        return { state: { step: 'second', start: p } };
      case 'second':
        if (same(p, s.start)) return { state: s, error: 'Second point must differ from the start point' };
        return { state: { step: 'end3p', start: s.start, second: p } };
      case 'end3p':
        return make(threePoint(s.start, s.second, p), 'The three points are in a line; pick another end point');
      case 'center':
        if (s.start) {
          if (same(p, s.start)) return { state: s, error: 'Centre must differ from the start point' };
          return { state: { step: 'endCenter', start: s.start, center: p } };
        }
        return { state: { step: 'startAfterCenter', center: p } };
      case 'startAfterCenter':
        if (same(p, s.center)) return { state: s, error: 'Start point must differ from the centre' };
        return { state: { step: 'endCenter', start: p, center: s.center } };
      case 'endCenter':
        return make(centred(s.start, s.center, p), 'End point must differ from the centre');
    }
  },
  preview(s, cursor, ctx) {
    const base = { id: PREVIEW_ID, layer: ctx.doc.currentLayer };
    if (s.step === 'second' || (s.step === 'center' && s.start)) {
      const from = s.step === 'second' ? s.start : s.start!;
      return [{ ...base, kind: 'line', start: [from[0], from[1], 0], end: [cursor[0], cursor[1], 0] }];
    }
    if (s.step === 'startAfterCenter') {
      return [{ ...base, kind: 'line', start: [s.center[0], s.center[1], 0], end: [cursor[0], cursor[1], 0] }];
    }
    const geom = s.step === 'end3p' ? threePoint(s.start, s.second, cursor) : s.step === 'endCenter' ? centred(s.start, s.center, cursor) : null;
    return geom ? [{ ...base, kind: 'arc', ...geom }] : [];
  },
};
