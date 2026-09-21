import type { CadDocument, Command, Entity, EntityId, IdGenerator } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';

/**
 * A drawing or editing tool is a pure reducer (spec F-01 design notes).
 * Mouse clicks and typed input reach it as the same `ToolInput`, so a command
 * typed in full behaves exactly like the same command driven by the mouse.
 */
export type ToolInput =
  | { readonly type: 'point'; readonly point: Vec2 }
  /** A bare typed number, delivered raw when the tool asks for one (angles, factors). */
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'word'; readonly value: string }
  | { readonly type: 'enter' };

export interface ToolContext {
  readonly doc: CadDocument;
  newId(prefix: string): EntityId;
  /** The current selection, in document order. */
  readonly selection: readonly EntityId[];
}

export interface ToolResult<S> {
  readonly state: S;
  /** Commands to execute through History, in order. */
  readonly commands?: readonly Command[];
  /** Tool finished; the session returns to idle. */
  readonly done?: boolean;
  /** Shown on the command line; the tool keeps its state. */
  readonly error?: string;
  /** Replace the selection (modify commands clear it when they finish). */
  readonly selection?: readonly EntityId[];
}

export interface ToolDefinition<S> {
  readonly name: string;
  /** Toolbar label. */
  readonly label: string;
  readonly aliases: readonly string[];
  init(ctx: ToolContext): S;
  /** Prompt text, with options in brackets like AutoCAD: `Specify next point or [Close/Undo]:` */
  prompt(state: S): string;
  handle(state: S, input: ToolInput, ctx: ToolContext): ToolResult<S>;
  /** Rubber-band entities for the current cursor position. */
  preview(state: S, cursor: Vec2, ctx: ToolContext): Entity[];
  /** Base point for @relative input and for bare distances. */
  lastPoint(state: S): Vec2 | null;
  /** Runs right after init; lets ERASE act at once on a pre-selection. */
  start?(state: S, ctx: ToolContext): ToolResult<S> | null;
  /** True while the tool is asking the user to select objects. */
  wantsSelection?(state: S): boolean;
  /** True when a bare number means a value (angle, factor), not a distance. */
  wantsNumber?(state: S): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any>;

export const PREVIEW_ID = '__preview__' as EntityId;

export function idsFrom(gen: IdGenerator): (prefix: string) => EntityId {
  return (prefix) => gen.next(prefix) as EntityId;
}
