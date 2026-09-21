import { addEntity, batch, deleteEntity, updateEntity, type CadDocument, type Entity, type EntityId } from '@cadw/core';
import { mirrorAcross, rotationAbout, scaleAbout, transformEntity, translation, type Transform2, type Vec2 } from '@cadw/geom2d';
import { type ToolContext, type ToolDefinition, type ToolResult } from '../tool.ts';

/**
 * Modify commands (REQ-003.6). Each works on the pre-selection, or asks
 * "Select objects" first (click / window / crossing, then Enter), and commits
 * one `batch` command, so one Ctrl+Z undoes the whole edit.
 */

type Select = { readonly step: 'select' };
const SELECT: Select = { step: 'select' };

export function entitiesOf(doc: CadDocument, ids: readonly EntityId[]): Entity[] {
  return ids.map((id) => doc.entities[id]).filter((e): e is Entity => !!e);
}

/** Shared handling of the "Select objects" step. */
export function finishSelection<S>(state: S, ctx: ToolContext, next: (ids: readonly EntityId[]) => S): ToolResult<S> {
  if (ctx.selection.length === 0) return { state, error: 'Nothing selected. Click, or drag a window, then press Enter.' };
  return { state: next(ctx.selection) };
}

export const selectPrompt = (name: string) => `${name} Select objects, then press Enter:`;

/** Previews / commits a transform of `ids`. */
export function transformed(doc: CadDocument, ids: readonly EntityId[], t: Transform2): Entity[] {
  return entitiesOf(doc, ids).map((e) => transformEntity(e, t));
}

// ---------------------------------------------------------------- MOVE

type MoveState = Select | { readonly step: 'base'; readonly ids: readonly EntityId[] } | { readonly step: 'second'; readonly ids: readonly EntityId[]; readonly base: Vec2 };

export const moveTool: ToolDefinition<MoveState> = {
  name: 'MOVE',
  label: 'Move',
  aliases: ['M'],
  init: (ctx) => (ctx.selection.length > 0 ? { step: 'base', ids: ctx.selection } : SELECT),
  wantsSelection: (s) => s.step === 'select',
  prompt(s) {
    if (s.step === 'select') return selectPrompt('MOVE');
    if (s.step === 'base') return `MOVE (${s.ids.length} selected) Specify base point:`;
    return 'MOVE Specify second point:';
  },
  lastPoint: (s) => (s.step === 'second' ? s.base : null),
  handle(s, input, ctx) {
    if (s.step === 'select') {
      if (input.type === 'enter') return finishSelection<MoveState>(s, ctx, (ids) => ({ step: 'base', ids }));
      return { state: s, error: 'Select objects in the drawing, then press Enter' };
    }
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type !== 'point') return { state: s, error: 'Expected a point' };
    if (s.step === 'base') return { state: { step: 'second', ids: s.ids, base: input.point } };
    const t = translation(input.point[0] - s.base[0], input.point[1] - s.base[1]);
    return {
      state: s,
      done: true,
      commands: [batch(transformed(ctx.doc, s.ids, t).map((e) => updateEntity(e)), 'move')],
      selection: [],
    };
  },
  preview(s, cursor, ctx) {
    if (s.step !== 'second') return [];
    return transformed(ctx.doc, s.ids, translation(cursor[0] - s.base[0], cursor[1] - s.base[1]));
  },
};

// ---------------------------------------------------------------- COPY

type CopyState = Select | { readonly step: 'base'; readonly ids: readonly EntityId[] } | { readonly step: 'second'; readonly ids: readonly EntityId[]; readonly base: Vec2; readonly copies: number };

/** COPY (CO, CP): repeats — each second point places another copy until Enter. */
export const copyTool: ToolDefinition<CopyState> = {
  name: 'COPY',
  label: 'Copy',
  aliases: ['CO', 'CP'],
  init: (ctx) => (ctx.selection.length > 0 ? { step: 'base', ids: ctx.selection } : SELECT),
  wantsSelection: (s) => s.step === 'select',
  prompt(s) {
    if (s.step === 'select') return selectPrompt('COPY');
    if (s.step === 'base') return `COPY (${s.ids.length} selected) Specify base point:`;
    return s.copies === 0 ? 'COPY Specify second point:' : 'COPY Specify second point or Enter to finish:';
  },
  lastPoint: (s) => (s.step === 'second' ? s.base : null),
  handle(s, input, ctx) {
    if (s.step === 'select') {
      if (input.type === 'enter') return finishSelection<CopyState>(s, ctx, (ids) => ({ step: 'base', ids }));
      return { state: s, error: 'Select objects in the drawing, then press Enter' };
    }
    if (input.type === 'enter') return { state: s, done: true, selection: [] };
    if (input.type !== 'point') return { state: s, error: 'Expected a point' };
    if (s.step === 'base') return { state: { step: 'second', ids: s.ids, base: input.point, copies: 0 } };
    const t = translation(input.point[0] - s.base[0], input.point[1] - s.base[1]);
    const copies = transformed(ctx.doc, s.ids, t).map((e) => ({ ...e, id: ctx.newId(e.kind) }) as Entity);
    return { state: { ...s, copies: s.copies + 1 }, commands: [batch(copies.map((e) => addEntity(e)), 'copy')] };
  },
  preview(s, cursor, ctx) {
    if (s.step !== 'second') return [];
    return transformed(ctx.doc, s.ids, translation(cursor[0] - s.base[0], cursor[1] - s.base[1]));
  },
};

// ---------------------------------------------------------------- ERASE

type EraseState = Select;

function erase(s: EraseState, ids: readonly EntityId[]): ToolResult<EraseState> {
  return { state: s, done: true, commands: [batch(ids.map((id) => deleteEntity(id)), 'erase')], selection: [] };
}

/** ERASE (E) and the Delete key: acts at once on a pre-selection. */
export const eraseTool: ToolDefinition<EraseState> = {
  name: 'ERASE',
  label: 'Erase',
  aliases: ['E'],
  init: () => SELECT,
  start: (s, ctx) => (ctx.selection.length > 0 ? erase(s, ctx.selection) : null),
  wantsSelection: () => true,
  prompt: () => selectPrompt('ERASE'),
  lastPoint: () => null,
  handle(s, input, ctx) {
    if (input.type !== 'enter') return { state: s, error: 'Select objects in the drawing, then press Enter' };
    if (ctx.selection.length === 0) return { state: s, done: true };
    return erase(s, ctx.selection);
  },
  preview: () => [],
};


// ---------------------------------------------------------------- ROTATE, SCALE


type BaseThen<V extends string> =
  | Select
  | { readonly step: 'base'; readonly ids: readonly EntityId[] }
  | { readonly step: V; readonly ids: readonly EntityId[]; readonly base: Vec2 };

/**
 * ROTATE (RO): base point, then an angle — typed in degrees (counter-clockwise),
 * or a point whose direction from the base gives the angle.
 */
export const rotateTool: ToolDefinition<BaseThen<'angle'>> = {
  name: 'ROTATE',
  label: 'Rotate',
  aliases: ['RO'],
  init: (ctx) => (ctx.selection.length > 0 ? { step: 'base', ids: ctx.selection } : SELECT),
  wantsSelection: (s) => s.step === 'select',
  wantsNumber: (s) => s.step === 'angle',
  prompt(s) {
    if (s.step === 'select') return selectPrompt('ROTATE');
    if (s.step === 'base') return `ROTATE (${s.ids.length} selected) Specify base point:`;
    return 'ROTATE Specify rotation angle (degrees):';
  },
  lastPoint: (s) => (s.step === 'angle' ? s.base : null),
  handle(s, input, ctx) {
    if (s.step === 'select') {
      if (input.type === 'enter') return finishSelection<BaseThen<'angle'>>(s, ctx, (ids) => ({ step: 'base', ids }));
      return { state: s, error: 'Select objects in the drawing, then press Enter' };
    }
    if (input.type === 'enter') return { state: s, done: true };
    if (s.step === 'base') {
      if (input.type !== 'point') return { state: s, error: 'Expected a point' };
      return { state: { step: 'angle', ids: s.ids, base: input.point } };
    }
    let angle: number;
    if (input.type === 'number') angle = (input.value * Math.PI) / 180;
    else if (input.type === 'point') angle = Math.atan2(input.point[1] - s.base[1], input.point[0] - s.base[0]);
    else return { state: s, error: 'Expected an angle or a point' };
    const t = rotationAbout(s.base, angle);
    return { state: s, done: true, commands: [batch(transformed(ctx.doc, s.ids, t).map((e) => updateEntity(e)), 'rotate')], selection: [] };
  },
  preview(s, cursor, ctx) {
    if (s.step !== 'angle') return [];
    return transformed(ctx.doc, s.ids, rotationAbout(s.base, Math.atan2(cursor[1] - s.base[1], cursor[0] - s.base[0])));
  },
};

/**
 * SCALE (SC): base point, then a factor — typed, or a point whose distance
 * from the base is the factor (as in AutoCAD).
 */
export const scaleTool: ToolDefinition<BaseThen<'factor'>> = {
  name: 'SCALE',
  label: 'Scale',
  aliases: ['SC'],
  init: (ctx) => (ctx.selection.length > 0 ? { step: 'base', ids: ctx.selection } : SELECT),
  wantsSelection: (s) => s.step === 'select',
  wantsNumber: (s) => s.step === 'factor',
  prompt(s) {
    if (s.step === 'select') return selectPrompt('SCALE');
    if (s.step === 'base') return `SCALE (${s.ids.length} selected) Specify base point:`;
    return 'SCALE Specify scale factor:';
  },
  lastPoint: (s) => (s.step === 'factor' ? s.base : null),
  handle(s, input, ctx) {
    if (s.step === 'select') {
      if (input.type === 'enter') return finishSelection<BaseThen<'factor'>>(s, ctx, (ids) => ({ step: 'base', ids }));
      return { state: s, error: 'Select objects in the drawing, then press Enter' };
    }
    if (input.type === 'enter') return { state: s, done: true };
    if (s.step === 'base') {
      if (input.type !== 'point') return { state: s, error: 'Expected a point' };
      return { state: { step: 'factor', ids: s.ids, base: input.point } };
    }
    let k: number;
    if (input.type === 'number') k = input.value;
    else if (input.type === 'point') k = Math.hypot(input.point[0] - s.base[0], input.point[1] - s.base[1]);
    else return { state: s, error: 'Expected a factor or a point' };
    if (!(k > 1e-12)) return { state: s, error: 'Scale factor must be greater than zero' };
    const t = scaleAbout(s.base, k);
    return { state: s, done: true, commands: [batch(transformed(ctx.doc, s.ids, t).map((e) => updateEntity(e)), 'scale')], selection: [] };
  },
  preview(s, cursor, ctx) {
    if (s.step !== 'factor') return [];
    const k = Math.hypot(cursor[0] - s.base[0], cursor[1] - s.base[1]);
    return k > 1e-12 ? transformed(ctx.doc, s.ids, scaleAbout(s.base, k)) : [];
  },
};

// ---------------------------------------------------------------- MIRROR

type MirrorState =
  | Select
  | { readonly step: 'first'; readonly ids: readonly EntityId[] }
  | { readonly step: 'second'; readonly ids: readonly EntityId[]; readonly p1: Vec2 }
  | { readonly step: 'erase'; readonly ids: readonly EntityId[]; readonly p1: Vec2; readonly p2: Vec2 };

/** MIRROR (MI): two points on the mirror line, then keep or erase the originals (default keep). */
export const mirrorTool: ToolDefinition<MirrorState> = {
  name: 'MIRROR',
  label: 'Mirror',
  aliases: ['MI'],
  init: (ctx) => (ctx.selection.length > 0 ? { step: 'first', ids: ctx.selection } : SELECT),
  wantsSelection: (s) => s.step === 'select',
  prompt(s) {
    if (s.step === 'select') return selectPrompt('MIRROR');
    if (s.step === 'first') return `MIRROR (${s.ids.length} selected) Specify first point of mirror line:`;
    if (s.step === 'second') return 'MIRROR Specify second point of mirror line:';
    return 'MIRROR Erase source objects? [Yes/No] <No>:';
  },
  lastPoint: (s) => (s.step === 'second' ? s.p1 : null),
  handle(s, input, ctx) {
    if (s.step === 'select') {
      if (input.type === 'enter') return finishSelection<MirrorState>(s, ctx, (ids) => ({ step: 'first', ids }));
      return { state: s, error: 'Select objects in the drawing, then press Enter' };
    }
    if (s.step === 'erase') {
      const answer = input.type === 'enter' ? 'N' : input.type === 'word' ? input.value[0] : '';
      if (answer !== 'Y' && answer !== 'N') return { state: s, error: 'Answer Yes or No' };
      const mirrored = transformed(ctx.doc, s.ids, mirrorAcross(s.p1, s.p2));
      const commands =
        answer === 'Y'
          ? mirrored.map((e) => updateEntity(e))
          : mirrored.map((e) => addEntity({ ...e, id: ctx.newId(e.kind) } as Entity));
      return { state: s, done: true, commands: [batch(commands, 'mirror')], selection: [] };
    }
    if (input.type === 'enter') return { state: s, done: true };
    if (input.type !== 'point') return { state: s, error: 'Expected a point' };
    if (s.step === 'first') return { state: { step: 'second', ids: s.ids, p1: input.point } };
    if (Math.hypot(input.point[0] - s.p1[0], input.point[1] - s.p1[1]) <= 1e-9) return { state: s, error: 'The two points must differ' };
    return { state: { step: 'erase', ids: s.ids, p1: s.p1, p2: input.point } };
  },
  preview(s, cursor, ctx) {
    if (s.step !== 'second' || Math.hypot(cursor[0] - s.p1[0], cursor[1] - s.p1[1]) <= 1e-9) return [];
    return transformed(ctx.doc, s.ids, mirrorAcross(s.p1, cursor));
  },
};

import { CURVE_EDIT_TOOLS } from './curve-edit.ts';

export const MODIFY_TOOLS = [moveTool, copyTool, rotateTool, scaleTool, mirrorTool, ...CURVE_EDIT_TOOLS, eraseTool];
