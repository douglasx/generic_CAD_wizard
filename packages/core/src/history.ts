import type { Command } from './commands.ts';
import { commandFromRecord } from './commands.ts';
import type { CadDocument } from './model.ts';

export interface JournalRecord {
  readonly type: string;
  readonly payload: unknown;
}

type Listener = (doc: CadDocument) => void;

interface Step {
  readonly forward: Command;
  readonly inverse: Command;
}

/** Undo/redo stack plus an append-only journal of executed commands. */
export class History {
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly journalRecords: JournalRecord[] = [];

  private current: CadDocument;
  private readonly limit: number;

  constructor(current: CadDocument, limit = 100) {
    this.current = current;
    this.limit = limit;
  }

  get doc(): CadDocument {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get journal(): readonly JournalRecord[] {
    return this.journalRecords;
  }

  execute(command: Command): CadDocument {
    const { doc, inverse } = command.apply(this.current);
    this.undoStack.push({ forward: command, inverse });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.journalRecords.push({ type: command.type, payload: command.payload });
    return this.set(doc);
  }

  undo(): CadDocument {
    const step = this.undoStack.pop();
    if (!step) return this.current;
    const { doc } = step.inverse.apply(this.current);
    this.redoStack.push(step);
    this.journalRecords.push({ type: 'undo', payload: null });
    return this.set(doc);
  }

  redo(): CadDocument {
    const step = this.redoStack.pop();
    if (!step) return this.current;
    const { doc, inverse } = step.forward.apply(this.current);
    this.undoStack.push({ forward: step.forward, inverse });
    this.journalRecords.push({ type: 'redo', payload: null });
    return this.set(doc);
  }

  /** Replace the document (e.g. after opening a file); clears undo/redo. */
  reset(doc: CadDocument): CadDocument {
    this.undoStack = [];
    this.redoStack = [];
    this.journalRecords.length = 0;
    return this.set(doc);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(doc: CadDocument): CadDocument {
    this.current = doc;
    for (const l of this.listeners) l(doc);
    return doc;
  }
}

/** Replays a journal from a starting document — used for bug repro and headless runs. */
export function replay(start: CadDocument, journal: readonly JournalRecord[]): CadDocument {
  const h = new History(start, Number.POSITIVE_INFINITY);
  for (const r of journal) {
    if (r.type === 'undo') h.undo();
    else if (r.type === 'redo') h.redo();
    else h.execute(commandFromRecord(r));
  }
  return h.doc;
}
