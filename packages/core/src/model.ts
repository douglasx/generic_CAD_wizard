import type { EntityId } from './ids.ts';
import { LENGTH_UNIT } from './units.ts';

/** Bumped whenever the stored document shape changes; migrate.ts upgrades older files. */
export const SCHEMA_VERSION = 2 as const;

export type Vec3 = readonly [number, number, number];

export const DEFAULT_LINEWEIGHT_MM = 0.25;
export const DEFAULT_LINETYPE = 'continuous';

/** Named dash patterns, in millimetres: [dash, gap, dash, gap, ...]. */
export const LINETYPES: Readonly<Record<string, readonly number[]>> = {
  continuous: [],
  dashed: [6, 3],
  dotted: [0.5, 3],
  dashdot: [12, 3, 0.5, 3],
  center: [20, 3, 6, 3],
  hidden: [3, 2],
};

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly lineweightMm: number;
  readonly linetype: string;
}

/** Per-entity overrides; anything unset comes from the entity's layer. */
export interface EntityStyle {
  readonly color?: string;
  readonly lineweightMm?: number;
  readonly linetype?: string;
}

interface EntityBase {
  readonly id: EntityId;
  readonly layer: string;
  readonly style?: EntityStyle;
}

export interface LineEntity extends EntityBase {
  readonly kind: 'line';
  readonly start: Vec3;
  readonly end: Vec3;
}

export interface PolylineEntity extends EntityBase {
  readonly kind: 'polyline';
  readonly points: readonly Vec3[];
  readonly closed: boolean;
}

/** Angles in radians, counter-clockwise from +X, swept from start to end. */
export interface ArcEntity extends EntityBase {
  readonly kind: 'arc';
  readonly center: Vec3;
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export interface CircleEntity extends EntityBase {
  readonly kind: 'circle';
  readonly center: Vec3;
  readonly radius: number;
}

/** `majorAxis` runs from the centre to the major-axis endpoint; `ratio` is minor/major. */
export interface EllipseEntity extends EntityBase {
  readonly kind: 'ellipse';
  readonly center: Vec3;
  readonly majorAxis: Vec3;
  readonly ratio: number;
}

/** Interpolating spline through `points` (centripetal Catmull-Rom, ADR 0008). */
export interface SplineEntity extends EntityBase {
  readonly kind: 'spline';
  readonly points: readonly Vec3[];
  readonly closed: boolean;
}

export type Entity = LineEntity | PolylineEntity | ArcEntity | CircleEntity | EllipseEntity | SplineEntity;
export type EntityKind = Entity['kind'];

export const ENTITY_KINDS: readonly EntityKind[] = ['line', 'polyline', 'arc', 'circle', 'ellipse', 'spline'];

export interface CadDocument {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly units: typeof LENGTH_UNIT;
  readonly name: string;
  readonly layers: Readonly<Record<string, Layer>>;
  readonly currentLayer: string;
  readonly entities: Readonly<Record<string, Entity>>;
  /** Ordered entity ids, so rendering and export are deterministic. */
  readonly order: readonly EntityId[];
}

export const DEFAULT_LAYER: Layer = {
  id: '0',
  name: '0',
  color: '#e6e6e6',
  visible: true,
  locked: false,
  lineweightMm: DEFAULT_LINEWEIGHT_MM,
  linetype: DEFAULT_LINETYPE,
};

export function createDocument(name = 'Untitled'): CadDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    units: LENGTH_UNIT,
    name,
    layers: { [DEFAULT_LAYER.id]: DEFAULT_LAYER },
    currentLayer: DEFAULT_LAYER.id,
    entities: {},
    order: [],
  };
}

export function entityList(doc: CadDocument): Entity[] {
  return doc.order.map((id) => doc.entities[id]).filter((e): e is Entity => e !== undefined);
}

/** Entities on visible layers, in draw order. */
export function visibleEntities(doc: CadDocument): Entity[] {
  return entityList(doc).filter((e) => doc.layers[e.layer]?.visible !== false);
}

export function layerOf(doc: CadDocument, entity: Entity): Layer {
  return doc.layers[entity.layer] ?? DEFAULT_LAYER;
}

/** Effective display style: entity overrides win over the layer's values. */
export function resolveStyle(doc: CadDocument, entity: Entity): Required<EntityStyle> {
  const layer = layerOf(doc, entity);
  return {
    color: entity.style?.color ?? layer.color,
    lineweightMm: entity.style?.lineweightMm ?? layer.lineweightMm,
    linetype: entity.style?.linetype ?? layer.linetype,
  };
}
