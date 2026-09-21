import type { Entity } from '@cadw/core';
import { ALL_SNAP_KINDS, findObjectSnap, type Snap, type SnapKind, type Vec2 } from '@cadw/geom2d';

/** Drafting aids (REQ-003.3, REQ-003.4). */
export interface DraftSettings {
  /** Master object-snap switch (F3). */
  readonly osnap: boolean;
  /** Which object snaps are on when OSNAP is on. */
  readonly snaps: readonly SnapKind[];
  /** Ortho mode (F8): lines from the base point run horizontal or vertical. */
  readonly ortho: boolean;
  /** Snap to the grid (F9). */
  readonly gridSnap: boolean;
  /** Grid snap spacing, mm. */
  readonly gridSpacing: number;
}

export const DEFAULT_SETTINGS: DraftSettings = {
  osnap: true,
  snaps: ['endpoint', 'intersection', 'midpoint', 'center', 'quadrant', 'perpendicular'],
  ortho: false,
  gridSnap: false,
  gridSpacing: 10,
};

export function parseSettings(json: string): DraftSettings {
  try {
    const raw = JSON.parse(json) as Partial<DraftSettings>;
    const snaps = Array.isArray(raw.snaps) ? raw.snaps.filter((k): k is SnapKind => ALL_SNAP_KINDS.includes(k as SnapKind)) : DEFAULT_SETTINGS.snaps;
    return {
      osnap: typeof raw.osnap === 'boolean' ? raw.osnap : DEFAULT_SETTINGS.osnap,
      snaps,
      ortho: typeof raw.ortho === 'boolean' ? raw.ortho : DEFAULT_SETTINGS.ortho,
      gridSnap: typeof raw.gridSnap === 'boolean' ? raw.gridSnap : DEFAULT_SETTINGS.gridSnap,
      gridSpacing: typeof raw.gridSpacing === 'number' && raw.gridSpacing > 0 ? raw.gridSpacing : DEFAULT_SETTINGS.gridSpacing,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface ResolvedCursor {
  readonly point: Vec2;
  readonly snap: Snap | null;
}

/**
 * Raw cursor → the point a click will use. Object snap wins; otherwise grid
 * snap, then ortho relative to the tool's base point (as in AutoCAD).
 */
export function resolveCursor(
  raw: Vec2,
  entities: readonly Entity[],
  settings: DraftSettings,
  base: Vec2 | null,
  unitsPerPixel: number,
  aperturePixels = 10,
): ResolvedCursor {
  if (settings.osnap && settings.snaps.length > 0) {
    const snap = findObjectSnap(raw, entities, {
      enabled: new Set(settings.snaps),
      radius: aperturePixels * unitsPerPixel,
      from: base,
      tolerance: Math.max(unitsPerPixel * 0.25, 1e-6),
    });
    if (snap) return { point: snap.point, snap };
  }
  let p = raw;
  if (settings.gridSnap && settings.gridSpacing > 0) {
    const g = settings.gridSpacing;
    p = [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g];
  }
  if (settings.ortho && base) {
    const dx = p[0] - base[0];
    const dy = p[1] - base[1];
    p = Math.abs(dx) >= Math.abs(dy) ? [p[0], base[1]] : [base[0], p[1]];
  }
  return { point: p, snap: null };
}

export const SNAP_LABELS: Readonly<Record<SnapKind, string>> = {
  endpoint: 'Endpoint',
  intersection: 'Intersection',
  midpoint: 'Midpoint',
  center: 'Center',
  quadrant: 'Quadrant',
  perpendicular: 'Perpendicular',
  nearest: 'Nearest',
};
