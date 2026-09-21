import {
  DEFAULT_LAYER,
  DEFAULT_LINETYPE,
  DEFAULT_LINEWEIGHT_MM,
  SCHEMA_VERSION,
  type CadDocument,
  type Layer,
} from './model.ts';

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

type AnyDoc = Record<string, unknown>;

/**
 * Upgrades any supported older document to the current schema (guardrail 3).
 * Each schema change adds one step here and a test with a real old file.
 */
export function migrateDocument(raw: unknown): CadDocument {
  if (typeof raw !== 'object' || raw === null) throw new SchemaError('Document is not an object');
  let doc = raw as AnyDoc;
  let version = doc['schemaVersion'];

  if (version === 1) {
    doc = migrate1to2(doc);
    version = doc['schemaVersion'];
  }

  if (version !== SCHEMA_VERSION) {
    if (typeof version === 'number' && version > SCHEMA_VERSION) {
      throw new SchemaError(`Document schema ${version} is newer than this app (${SCHEMA_VERSION}); please update`);
    }
    throw new SchemaError(`Unsupported document schema version: ${String(version)}`);
  }

  const d = doc as unknown as CadDocument;
  if (typeof d.entities !== 'object' || !Array.isArray(d.order) || typeof d.layers !== 'object') {
    throw new SchemaError('Document is missing entities, order or layers');
  }
  if (!d.layers[d.currentLayer]) throw new SchemaError(`Current layer ${d.currentLayer} does not exist`);
  return d;
}

/** v1 → v2: layers gained lock, lineweight and linetype; the document gained currentLayer. */
function migrate1to2(doc: AnyDoc): AnyDoc {
  const oldLayers = (doc['layers'] ?? {}) as Record<string, Partial<Layer>>;
  const layers: Record<string, Layer> = {};
  for (const [id, l] of Object.entries(oldLayers)) {
    layers[id] = {
      id: l.id ?? id,
      name: l.name ?? id,
      color: l.color ?? DEFAULT_LAYER.color,
      visible: l.visible ?? true,
      locked: l.locked ?? false,
      lineweightMm: l.lineweightMm ?? DEFAULT_LINEWEIGHT_MM,
      linetype: l.linetype ?? DEFAULT_LINETYPE,
    };
  }
  if (Object.keys(layers).length === 0) layers[DEFAULT_LAYER.id] = DEFAULT_LAYER;
  const current = layers[DEFAULT_LAYER.id] ? DEFAULT_LAYER.id : Object.keys(layers)[0]!;
  return { ...doc, schemaVersion: 2, layers, currentLayer: current };
}
