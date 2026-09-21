import { addEntity, batch, CommandError, deleteEntity, updateEntity, type Command } from './commands.ts';
import type { EntityId } from './ids.ts';
import { addLayer, deleteLayer, setCurrentLayer, updateLayer, type LayerProps } from './layers.ts';
import type { Entity, Layer } from './model.ts';

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
    case 'addLayer':
      return addLayer((record.payload as { layer: Layer }).layer);
    case 'updateLayer': {
      const p = record.payload as { id: string; props: LayerProps };
      return updateLayer(p.id, p.props);
    }
    case 'deleteLayer':
      return deleteLayer((record.payload as { id: string }).id);
    case 'setCurrentLayer':
      return setCurrentLayer((record.payload as { id: string }).id);
    case 'batch': {
      const p = record.payload as { label: string; commands: { type: string; payload: unknown }[] };
      return batch(p.commands.map(commandFromRecord), p.label);
    }
    default:
      throw new CommandError(`Unknown command type ${record.type}`);
  }
}
