import { describe, expect, it } from 'vitest';
import { createDocument, migrateDocument, nearlyEqual, relativelyEqual, SchemaError, SCHEMA_VERSION } from '../src/index.ts';

describe('units', () => {
  it('compares within linear tolerance', () => {
    expect(nearlyEqual(1, 1 + 5e-7)).toBe(true);
    expect(nearlyEqual(1, 1 + 5e-6)).toBe(false);
  });
  it('compares large values relatively', () => {
    expect(relativelyEqual(24_000_000, 24_000_000.001)).toBe(true);
    expect(relativelyEqual(24_000_000, 24_000_100)).toBe(false);
  });
});

describe('migrateDocument', () => {
  it('accepts the current schema', () => {
    const d = createDocument('A');
    expect(migrateDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('rejects newer, unknown and malformed documents', () => {
    expect(() => migrateDocument({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrateDocument({ schemaVersion: 0 })).toThrow(SchemaError);
    expect(() => migrateDocument(null)).toThrow(SchemaError);
    expect(() => migrateDocument({ schemaVersion: SCHEMA_VERSION })).toThrow(/missing/);
  });
});
