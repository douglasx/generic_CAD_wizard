import { SCHEMA_VERSION, type CadDocument } from './model.ts';

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

/**
 * Upgrades any supported older document to the current schema (guardrail 3).
 * Each future schema change adds a step here and a test.
 */
export function migrateDocument(raw: unknown): CadDocument {
  if (typeof raw !== 'object' || raw === null) throw new SchemaError('Document is not an object');
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === SCHEMA_VERSION) {
    const d = raw as CadDocument;
    if (typeof d.entities !== 'object' || !Array.isArray(d.order) || typeof d.layers !== 'object') {
      throw new SchemaError('Document is missing entities, order or layers');
    }
    return d;
  }
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new SchemaError(`Document schema ${version} is newer than this app (${SCHEMA_VERSION}); please update`);
  }
  throw new SchemaError(`Unsupported document schema version: ${String(version)}`);
}
