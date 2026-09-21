import { useState } from 'react';
import { ALL_SNAP_KINDS, type SnapKind } from '@cadw/geom2d';
import { SNAP_LABELS, type DraftSettings } from './cursor.ts';

interface Props {
  settings: DraftSettings;
  onChange(next: DraftSettings): void;
}

/** OSNAP (F3), ORTHO (F8) and GRID (F9) toggles, plus per-snap choices (REQ-003.3, REQ-003.4). */
export function DraftingBar({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggleSnap = (k: SnapKind) =>
    onChange({ ...settings, snaps: settings.snaps.includes(k) ? settings.snaps.filter((x) => x !== k) : [...settings.snaps, k] });

  return (
    <span className="drafting">
      <button aria-pressed={settings.osnap} onClick={() => onChange({ ...settings, osnap: !settings.osnap })} title="Object snap (F3)">
        OSNAP
      </button>
      <button aria-expanded={open} aria-label="Object snap settings" onClick={() => setOpen((o) => !o)} className="caret">
        ▾
      </button>
      {open && (
        <div className="snap-menu" role="group" aria-label="Object snaps">
          {ALL_SNAP_KINDS.map((k) => (
            <label key={k}>
              <input type="checkbox" checked={settings.snaps.includes(k)} onChange={() => toggleSnap(k)} />
              {SNAP_LABELS[k]}
            </label>
          ))}
        </div>
      )}
      <button aria-pressed={settings.ortho} onClick={() => onChange({ ...settings, ortho: !settings.ortho })} title="Ortho mode (F8)">
        ORTHO
      </button>
      <button aria-pressed={settings.gridSnap} onClick={() => onChange({ ...settings, gridSnap: !settings.gridSnap })} title={`Grid snap ${settings.gridSpacing} mm (F9)`}>
        GRID
      </button>
    </span>
  );
}
