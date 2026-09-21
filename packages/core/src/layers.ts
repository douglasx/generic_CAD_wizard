import { CommandError, type Command } from './commands.ts';
import { DEFAULT_LAYER, LINETYPES, type CadDocument, type Layer } from './model.ts';

/**
 * Layer commands (REQ-003.8). Every change is a Command with an exact inverse,
 * so layer edits undo and replay like geometry edits.
 */

export type LayerProps = Partial<Omit<Layer, 'id'>>;

const LINEWEIGHT_MIN = 0;
const LINEWEIGHT_MAX = 2.11; // ISO 128 upper bound (mm)

function validate(doc: CadDocument, id: string, props: LayerProps): void {
  if (props.name !== undefined) {
    const name = props.name.trim();
    if (!name) throw new CommandError('Layer name cannot be empty');
    const clash = Object.values(doc.layers).find((l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new CommandError(`A layer named "${name}" already exists`);
  }
  if (props.color !== undefined && !/^#[0-9a-f]{6}$/i.test(props.color)) throw new CommandError(`Invalid colour ${props.color}`);
  if (props.lineweightMm !== undefined && !(props.lineweightMm >= LINEWEIGHT_MIN && props.lineweightMm <= LINEWEIGHT_MAX)) {
    throw new CommandError(`Lineweight must be between ${LINEWEIGHT_MIN} and ${LINEWEIGHT_MAX} mm`);
  }
  if (props.linetype !== undefined && !(props.linetype in LINETYPES)) throw new CommandError(`Unknown linetype ${props.linetype}`);
}

export function addLayer(layer: Layer): Command {
  return {
    type: 'addLayer',
    payload: { layer },
    apply(doc) {
      if (doc.layers[layer.id]) throw new CommandError(`Layer ${layer.id} already exists`);
      validate(doc, layer.id, layer);
      const next = { ...layer, name: layer.name.trim() };
      return { doc: { ...doc, layers: { ...doc.layers, [layer.id]: next } }, inverse: deleteLayer(layer.id) };
    },
  };
}

export function updateLayer(id: string, props: LayerProps): Command {
  return {
    type: 'updateLayer',
    payload: { id, props },
    apply(doc) {
      const prev = doc.layers[id];
      if (!prev) throw new CommandError(`Layer ${id} does not exist`);
      validate(doc, id, props);
      const next: Layer = { ...prev, ...props, ...(props.name !== undefined ? { name: props.name.trim() } : {}), id };
      const undo: LayerProps = {};
      for (const k of Object.keys(props) as (keyof LayerProps)[]) (undo as Record<string, unknown>)[k] = prev[k];
      return { doc: { ...doc, layers: { ...doc.layers, [id]: next } }, inverse: updateLayer(id, undo) };
    },
  };
}

/** Deletes an empty layer. Layer 0 and the current layer cannot be deleted (as in AutoCAD). */
export function deleteLayer(id: string): Command {
  return {
    type: 'deleteLayer',
    payload: { id },
    apply(doc) {
      const layer = doc.layers[id];
      if (!layer) throw new CommandError(`Layer ${id} does not exist`);
      if (id === DEFAULT_LAYER.id) throw new CommandError('Layer 0 cannot be deleted');
      if (id === doc.currentLayer) throw new CommandError('The current layer cannot be deleted');
      const used = doc.order.filter((eid) => doc.entities[eid]?.layer === id).length;
      if (used > 0) throw new CommandError(`Layer ${layer.name} still has ${used} object${used === 1 ? '' : 's'}`);
      const { [id]: _gone, ...layers } = doc.layers;
      return { doc: { ...doc, layers }, inverse: addLayer(layer) };
    },
  };
}

export function setCurrentLayer(id: string): Command {
  return {
    type: 'setCurrentLayer',
    payload: { id },
    apply(doc) {
      if (!doc.layers[id]) throw new CommandError(`Layer ${id} does not exist`);
      return { doc: { ...doc, currentLayer: id }, inverse: setCurrentLayer(doc.currentLayer) };
    },
  };
}

/** Next unused "Layer N" name. */
export function nextLayerName(doc: CadDocument): string {
  const names = new Set(Object.values(doc.layers).map((l) => l.name.toLowerCase()));
  for (let i = 1; ; i++) if (!names.has(`layer ${i}`)) return `Layer ${i}`;
}

/** Layers sorted for display: 0 first, then by name (natural order). */
export function sortedLayers(doc: CadDocument): Layer[] {
  return Object.values(doc.layers).sort((a, b) =>
    a.id === DEFAULT_LAYER.id ? -1 : b.id === DEFAULT_LAYER.id ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

/** Object count per layer id. */
export function layerUsage(doc: CadDocument): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of doc.order) {
    const e = doc.entities[id];
    if (e) out[e.layer] = (out[e.layer] ?? 0) + 1;
  }
  return out;
}
