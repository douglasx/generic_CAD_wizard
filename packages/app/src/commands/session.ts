import { CommandError, type Entity, type History, type IdGenerator } from '@cadw/core';
import type { Vec2 } from '@cadw/geom2d';
import { parseInput, pointAlong } from './parse.ts';
import { idsFrom, type AnyTool, type ToolContext, type ToolInput } from './tool.ts';

export interface SessionSnapshot {
  readonly prompt: string;
  readonly activeTool: string | null;
  readonly log: readonly string[];
}

const IDLE_PROMPT = 'Command:';
const LOG_LIMIT = 200;

/**
 * The command session: owns the active tool and routes every input — typed
 * text, mouse points, Enter, Esc — through one path (REQ-003.9). Pure
 * TypeScript, no DOM, so it is tested without a browser.
 */
export class CommandSession {
  private readonly history: History;
  private readonly tools = new Map<string, AnyTool>();
  private readonly newId: (prefix: string) => ReturnType<ReturnType<typeof idsFrom>>;
  private tool: AnyTool | null = null;
  private state: unknown = null;
  private lastCommand: string | null = null;
  private readonly logLines: string[] = [];
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(history: History, ids: IdGenerator, tools: readonly AnyTool[]) {
    this.history = history;
    this.newId = idsFrom(ids);
    for (const t of tools) {
      this.tools.set(t.name, t);
      for (const a of t.aliases) this.tools.set(a, t);
    }
  }

  get snapshot(): SessionSnapshot {
    return {
      prompt: this.tool ? this.tool.prompt(this.state) : IDLE_PROMPT,
      activeTool: this.tool?.name ?? null,
      log: this.logLines,
    };
  }

  /** Increments on every change; lets React subscribe cheaply. */
  get version(): number {
    return this.revision;
  }

  get lastPoint(): Vec2 | null {
    return this.tool ? this.tool.lastPoint(this.state) : null;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start a tool by name or alias (toolbar buttons call this). */
  run(name: string): boolean {
    const tool = this.tools.get(name.toUpperCase());
    if (!tool) {
      this.log(`Unknown command "${name.toUpperCase()}".`);
      this.emit();
      return false;
    }
    this.tool = tool;
    this.state = tool.init(this.ctx());
    this.lastCommand = tool.name;
    this.log(`Command: ${tool.name}`);
    this.emit();
    return true;
  }

  /**
   * Text submitted from the command line. `cursor` turns a bare distance into a
   * point along the rubber band.
   */
  submit(text: string, cursor: Vec2 | null = null): void {
    const parsed = parseInput(text, this.lastPoint);

    if (!this.tool) {
      if (parsed.kind === 'enter') {
        if (this.lastCommand) this.run(this.lastCommand);
        return;
      }
      if (parsed.kind === 'word') {
        if (parsed.value === 'U' || parsed.value === 'UNDO') return this.undo();
        if (parsed.value === 'REDO') return this.redo();
        this.run(parsed.value);
        return;
      }
      this.log(`Unknown command "${text.trim()}".`);
      this.emit();
      return;
    }

    this.log(`${this.snapshot.prompt} ${text.trim()}`);
    switch (parsed.kind) {
      case 'enter':
        return this.feed({ type: 'enter' });
      case 'word':
        return this.feed({ type: 'word', value: parsed.value });
      case 'point':
        return this.feed({ type: 'point', point: parsed.point });
      case 'distance': {
        const base = this.lastPoint;
        const p = base && cursor ? pointAlong(base, cursor, parsed.value) : null;
        if (!p) {
          this.log('A distance needs a previous point and a cursor direction.');
          this.emit();
          return;
        }
        return this.feed({ type: 'point', point: p });
      }
      case 'error':
        this.log(parsed.message);
        this.emit();
        return;
    }
  }

  /** A mouse click in the viewport (already snapped). */
  point(p: Vec2): void {
    if (!this.tool) return;
    this.feed({ type: 'point', point: p });
  }

  enter(): void {
    if (this.tool) this.feed({ type: 'enter' });
    else this.submit('');
  }

  cancel(): void {
    if (!this.tool) return;
    this.log('*Cancel*');
    this.tool = null;
    this.state = null;
    this.emit();
  }

  undo(): void {
    this.cancel();
    if (this.history.canUndo) this.history.undo();
    else this.log('Nothing to undo.');
    this.emit();
  }

  redo(): void {
    this.cancel();
    if (this.history.canRedo) this.history.redo();
    else this.log('Nothing to redo.');
    this.emit();
  }

  preview(cursor: Vec2): Entity[] {
    return this.tool ? this.tool.preview(this.state, cursor, this.ctx()) : [];
  }

  private feed(input: ToolInput): void {
    const tool = this.tool;
    if (!tool) return;
    const result = tool.handle(this.state, input, this.ctx());
    try {
      for (const c of result.commands ?? []) this.history.execute(c);
    } catch (e) {
      // A refused command (e.g. locked layer) leaves the document untouched.
      this.log(e instanceof CommandError ? e.message : String(e));
      this.emit();
      return;
    }
    this.state = result.state;
    if (result.error) this.log(result.error);
    if (result.done) {
      this.tool = null;
      this.state = null;
    }
    this.emit();
  }

  private ctx(): ToolContext {
    return { doc: this.history.doc, newId: this.newId };
  }

  private log(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > LOG_LIMIT) this.logLines.splice(0, this.logLines.length - LOG_LIMIT);
  }

  private emit(): void {
    this.revision++;
    for (const l of this.listeners) l();
  }
}
