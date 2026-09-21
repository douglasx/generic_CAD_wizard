import type { CadDocument, EntityId } from '@cadw/core';

export type Selection = ReadonlySet<EntityId>;
export const EMPTY_SELECTION: Selection = new Set();

/**
 * How a pick or box combines with the current selection (REQ-003.5).
 * Plain click/drag replaces; Shift+drag adds; Shift+click toggles one entity.
 */
export function combineSelection(current: Selection, hits: readonly EntityId[], mode: 'replace' | 'add' | 'toggle'): Selection {
  if (mode === 'replace') return new Set(hits);
  const next = new Set(current);
  if (mode === 'add') for (const id of hits) next.add(id);
  else for (const id of hits) (next.has(id) ? next.delete(id) : next.add(id));
  return next;
}

/** Drops ids that no longer exist (e.g. after undo) or sit on hidden or locked layers. */
export function pruneSelection(sel: Selection, doc: CadDocument): Selection {
  let changed = false;
  const next = new Set<EntityId>();
  for (const id of sel) {
    const e = doc.entities[id];
    const layer = e && doc.layers[e.layer];
    if (e && layer && layer.visible && !layer.locked) next.add(id);
    else changed = true;
  }
  return changed ? next : sel;
}
