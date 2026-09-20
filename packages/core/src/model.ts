import type { EntityId } from './ids.ts';
import { LENGTH_UNIT } from './units.ts';

export const SCHEMA_VERSION = 1 as const;

export type Vec3 = readonly [number, number, number];

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly visible: boolean;
}

interface EntityBase {
  readonly id: EntityId;
  readonly layer: string;
}

export interface LineEntity extends EntityBase {
  readonly kind: 'line';
  readonly start: Vec3;
  readonly end: Vec3;
}

/** Grows milestone by milestone (arc, circle, spline, surface, shape...). */
export type Entity = LineEntity;

export interface CadDocument {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly units: typeof LENGTH_UNIT;
  readonly name: string;
  readonly layers: Readonly<Record<string, Layer>>;
  readonly entities: Readonly<Record<string, Entity>>;
  /** Ordered entity ids, so rendering and export are deterministic. */
  readonly order: readonly EntityId[];
}

export const DEFAULT_LAYER: Layer = { id: '0', name: '0', color: '#e6e6e6', visible: true };

export function createDocument(name = 'Untitled'): CadDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    units: LENGTH_UNIT,
    name,
    layers: { [DEFAULT_LAYER.id]: DEFAULT_LAYER },
    entities: {},
    order: [],
  };
}

export function entityList(doc: CadDocument): Entity[] {
  return doc.order.map((id) => doc.entities[id]).filter((e): e is Entity => e !== undefined);
}
