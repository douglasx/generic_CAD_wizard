import { addEntity, batch, deleteEntity, updateEntity, visibleEntities, type Command, type Entity } from '@cadw/core';
import { extendEntity, offsetEntity, pickEntity, trimEntity, type Vec2 } from '@cadw/geom2d';
import type { ToolContext, ToolDefinition } from '../tool.ts';

/**
 * TRIM, EXTEND and OFFSET (REQ-003.6). TRIM and EXTEND use AutoCAD's quick
 * mode: every visible entity is a cutting edge / boundary; the user picks the
 * part to remove or the end to extend. Each pick is its own undo step.
 */

const TOL = 1e-6;

function pickAt(ctx: ToolContext, p: Vec2): Entity | null {
  const candidates = visibleEntities(ctx.doc).filter((e) => !ctx.doc.layers[e.layer]?.locked);
  const id = pickEntity(p, candidates, ctx.pickRadius, TOL);
  return id ? (ctx.doc.entities[id] ?? null) : null;
}

/** Replace `original` with `pieces`: the first same-kind piece keeps the id (so attributes will follow it). */
function replaceWith(original: Entity, pieces: readonly Entity[], ctx: ToolContext): Command {
  const commands: Command[] = [];
  let reused = false;
  for (const p of pieces) {
    if (!reused && p.kind === original.kind) {
      commands.push(updateEntity({ ...p, id: original.id }));
      reused = true;
    } else {
      commands.push(addEntity({ ...p, id: ctx.newId(p.kind) } as Entity));
    }
  }
  if (!reused) commands.unshift(deleteEntity(original.id));
  return batch(commands, 'trim');
}

interface PickState {
  readonly count: number;
}

export const trimTool: ToolDefinition<PickState> = {
  name: 'TRIM',
  label: 'Trim',
  aliases: ['TR'],
  init: () => ({ count: 0 }),
  wantsPick: () => true,
  prompt: (s) => (s.count === 0 ? 'TRIM Select object to trim:' : 'TRIM Select object to trim, or Enter to finish:'),
  lastPoint: () => null,
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type !== 'point') return { state: s, error: 'Click the part of an object to remove' };
    const e = pickAt(ctx, input.point);
    if (!e) return { state: s, error: 'No object there' };
    const r = trimEntity(e, input.point, visibleEntities(ctx.doc), TOL);
    if (!r.ok) return { state: s, error: r.reason };
    return { state: { count: s.count + 1 }, commands: [replaceWith(e, r.value.kept, ctx)] };
  },
  preview(_s, cursor, ctx) {
    const e = pickAt(ctx, cursor);
    if (!e) return [];
    const r = trimEntity(e, cursor, visibleEntities(ctx.doc), TOL);
    return r.ok ? r.value.removed : [];
  },
};

export const extendTool: ToolDefinition<PickState> = {
  name: 'EXTEND',
  label: 'Extend',
  aliases: ['EX'],
  init: () => ({ count: 0 }),
  wantsPick: () => true,
  prompt: (s) => (s.count === 0 ? 'EXTEND Select object to extend (click near the end):' : 'EXTEND Select object to extend, or Enter to finish:'),
  lastPoint: () => null,
  handle(s, input, ctx) {
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type !== 'point') return { state: s, error: 'Click near the end of an object' };
    const e = pickAt(ctx, input.point);
    if (!e) return { state: s, error: 'No object there' };
    const r = extendEntity(e, input.point, visibleEntities(ctx.doc), TOL);
    if (!r.ok) return { state: s, error: r.reason };
    return { state: { count: s.count + 1 }, commands: [updateEntity(r.value)] };
  },
  preview(_s, cursor, ctx) {
    const e = pickAt(ctx, cursor);
    if (!e) return [];
    const r = extendEntity(e, cursor, visibleEntities(ctx.doc), TOL);
    return r.ok ? [r.value] : [];
  },
};

type OffsetState =
  | { readonly step: 'distance'; readonly last: number | null }
  | { readonly step: 'object'; readonly distance: number }
  | { readonly step: 'side'; readonly distance: number; readonly target: Entity };

let lastOffset: number | null = null;

/** OFFSET (O): distance (remembered), then repeatedly pick an object and a side. */
export const offsetTool: ToolDefinition<OffsetState> = {
  name: 'OFFSET',
  label: 'Offset',
  aliases: ['O'],
  init: () => ({ step: 'distance', last: lastOffset }),
  wantsNumber: (s) => s.step === 'distance',
  wantsPick: (s) => s.step === 'object',
  prompt(s) {
    if (s.step === 'distance') return s.last ? `OFFSET Specify offset distance <${s.last}>:` : 'OFFSET Specify offset distance:';
    if (s.step === 'object') return `OFFSET (${s.distance}) Select object to offset, or Enter to finish:`;
    return 'OFFSET Specify point on side to offset:';
  },
  lastPoint: () => null,
  handle(s, input, ctx) {
    if (s.step === 'distance') {
      const d = input.type === 'number' ? input.value : input.type === 'enter' ? s.last : null;
      if (d === null) return input.type === 'enter' ? { state: s, done: true } : { state: s, error: 'Type the offset distance' };
      if (!(d > 0)) return { state: s, error: 'Offset distance must be greater than zero' };
      lastOffset = d;
      return { state: { step: 'object', distance: d } };
    }
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type !== 'point') return { state: s, error: 'Expected a point' };
    if (s.step === 'object') {
      const e = pickAt(ctx, input.point);
      if (!e) return { state: s, error: 'No object there' };
      return { state: { step: 'side', distance: s.distance, target: e } };
    }
    const r = offsetEntity(s.target, s.distance, input.point);
    if (!r.ok) return { state: { step: 'object', distance: s.distance }, error: r.reason };
    return {
      state: { step: 'object', distance: s.distance },
      commands: [addEntity({ ...r.value, id: ctx.newId(r.value.kind) } as Entity)],
    };
  },
  preview(s, cursor) {
    if (s.step !== 'side') return [];
    const r = offsetEntity(s.target, s.distance, cursor);
    return r.ok ? [r.value] : [];
  },
};

export const CURVE_EDIT_TOOLS = [trimTool, extendTool, offsetTool];
