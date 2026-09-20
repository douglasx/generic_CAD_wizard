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
      if (!doc.layers[entity.layer]) throw new CommandError(`Layer ${entity.layer} does not exist`);
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
      const index = doc.order.indexOf(id);
      const { [id]: _removed, ...rest } = doc.entities;
      return {
        doc: { ...doc, entities: rest, order: doc.order.filter((x) => x !== id) },
        inverse: addEntity(entity, index),
      };
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
    default:
      throw new CommandError(`Unknown command type ${record.type}`);
  }
}
