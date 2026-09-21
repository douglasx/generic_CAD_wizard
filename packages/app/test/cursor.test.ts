import { describe, expect, it } from 'vitest';
import type { Entity, EntityId } from '@cadw/core';
import { DEFAULT_SETTINGS, parseSettings, resolveCursor, type DraftSettings } from '../src/cursor.ts';

const line = { id: 'l' as EntityId, layer: '0', kind: 'line', start: [0, 0, 0], end: [100, 0, 0] } as Entity;
const s = (over: Partial<DraftSettings>): DraftSettings => ({ ...DEFAULT_SETTINGS, ...over });

describe('resolveCursor (REQ-003.3, REQ-003.4)', () => {
  it('object snap wins over grid and ortho', () => {
    const r = resolveCursor([99, 3], [line], s({ gridSnap: true, ortho: true }), [0, 50], 1);
    expect(r.snap?.kind).toBe('endpoint');
    expect(r.point).toEqual([100, 0]);
  });

  it('OSNAP off: no object snap', () => {
    expect(resolveCursor([99, 3], [line], s({ osnap: false }), null, 1).snap).toBeNull();
  });

  it('grid snap rounds to the spacing', () => {
    expect(resolveCursor([12.3, 17.8], [], s({ gridSnap: true, gridSpacing: 10 }), null, 1).point).toEqual([10, 20]);
    expect(resolveCursor([12.3, 17.8], [], s({ gridSnap: true, gridSpacing: 2.5 }), null, 1).point).toEqual([12.5, 17.5]);
  });

  it('ortho keeps the dominant direction from the base point', () => {
    expect(resolveCursor([80, 7], [], s({ ortho: true }), [0, 0], 1).point).toEqual([80, 0]);
    expect(resolveCursor([6, -90], [], s({ ortho: true }), [0, 0], 1).point).toEqual([0, -90]);
    expect(resolveCursor([80, 7], [], s({ ortho: true }), null, 1).point).toEqual([80, 7]); // no base point yet
  });

  it('grid then ortho', () => {
    expect(resolveCursor([83, 4], [], s({ ortho: true, gridSnap: true }), [0, 0], 1).point).toEqual([80, 0]);
  });
});

describe('parseSettings', () => {
  it('round-trips, ignores junk and falls back to defaults', () => {
    const custom = s({ ortho: true, snaps: ['endpoint'], gridSpacing: 5 });
    expect(parseSettings(JSON.stringify(custom))).toEqual(custom);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"snaps":["endpoint","bogus"],"gridSpacing":-1}')).toMatchObject({ snaps: ['endpoint'], gridSpacing: 10 });
  });
});
