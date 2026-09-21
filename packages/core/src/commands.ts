import type { EntityId } from './ids.ts';
import type { CadDocument, Entity } from './model.ts';

/**
 * Every edit is a Command (guardrail 6). `apply` is pure: it returns the new
 * document and the inverse command, so undo/redo and journal replay are exact.
 */
export interface Command {
  readonly type: string;
  /** Serializable payload for the journal. */
  readonly payload: unknown;
  apply(doc: CadDocument): { doc: CadDocument; inverse: Command };
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export function addEntity(entity: Entity, index?: number): Command {
  return {
    type: 'addEntity',
    payload: { entity, index },
    apply(doc) {
      if (doc.entities[entity.id]) throw new CommandError(`Entity ${entity.id} already exists`);
      const layer = doc.layers[entity.layer];
      if (!layer) throw new CommandError(`Layer ${entity.layer} does not exist`);
      if (layer.locked) throw new CommandError(`Layer ${layer.name} is locked`);
      const order = [...doc.order];
      order.splice(index ?? order.length, 0, entity.id);
      return {
        doc: { ...doc, entities: { ...doc.entities, [entity.id]: entity }, order },
        inverse: deleteEntity(entity.id),
      };
    },
  };
}

export function deleteEntity(id: EntityId): Command {
  return {
    type: 'deleteEntity',
    payload: { id },
    apply(doc) {
      const entity = doc.entities[id];
      if (!entity) throw new CommandError(`Entity ${id} does not exist`);
      if (doc.layers[entity.layer]?.locked) throw new CommandError(`Layer ${entity.layer} is locked`);
      const index = doc.order.indexOf(id);
      const { [id]: _removed, ...rest } = doc.entities;
      return {
        doc: { ...doc, entities: rest, order: doc.order.filter((x) => x !== id) },
        inverse: addEntity(entity, index),
      };
    },
  };
}

/**
 * Replaces an entity with an edited version (same id and kind). Used by grip
 * edits and, later, transforms. The inverse restores the original exactly.
 */
export function updateEntity(next: Entity): Command {
  return {
    type: 'updateEntity',
    payload: { entity: next },
    apply(doc) {
      const prev = doc.entities[next.id];
      if (!prev) throw new CommandError(`Entity ${next.id} does not exist`);
      if (prev.kind !== next.kind) throw new CommandError(`Cannot change ${prev.kind} into ${next.kind}`);
      if (doc.layers[prev.layer]?.locked) throw new CommandError(`Layer ${prev.layer} is locked`);
      const layer = doc.layers[next.layer];
      if (!layer) throw new CommandError(`Layer ${next.layer} does not exist`);
      if (layer.locked) throw new CommandError(`Layer ${layer.name} is locked`);
      return { doc: { ...doc, entities: { ...doc.entities, [next.id]: next } }, inverse: updateEntity(prev) };
    },
  };
}

/**
 * Several commands as one undo step (a MOVE of 50 entities undoes at once).
 * Applied in order; if any step fails, nothing changes. The inverse applies
 * the inverses in reverse order.
 */
export function batch(commands: readonly Command[], label = 'batch'): Command {
  return {
    type: 'batch',
    payload: { label, commands: commands.map((c) => ({ type: c.type, payload: c.payload })) },
    apply(doc) {
      let current = doc;
      const inverses: Command[] = [];
      for (const c of commands) {
        const r = c.apply(current); // throws → caller's document is untouched
        current = r.doc;
        inverses.push(r.inverse);
      }
      return { doc: current, inverse: batch(inverses.reverse(), label) };
    },
  };
}

/** Rebuilds a command from its journal record. */
export function commandFromRecord(record: { type: string; payload: unknown }): Command {
  switch (record.type) {
    case 'addEntity': {
      const p = record.payload as { entity: Entity; index?: number };
      return addEntity(p.entity, p.index);
    }
    case 'deleteEntity':
      return deleteEntity((record.payload as { id: EntityId }).id);
    case 'updateEntity':
      return updateEntity((record.payload as { entity: Entity }).entity);
    case 'batch': {
      const p = record.payload as { label: string; commands: { type: string; payload: unknown }[] };
      return batch(p.commands.map(commandFromRecord), p.label);
    }
    default:
      throw new CommandError(`Unknown command type ${record.type}`);
  }
}
