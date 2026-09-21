import { addEntity, batch, deleteEntity, updateEntity, type CadDocument, type Entity, type EntityId } from '@cadw/core';
import { transformEntity, translation, type Transform2, type Vec2 } from '@cadw/geom2d';
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

export const MODIFY_TOOLS = [moveTool, copyTool, eraseTool];
