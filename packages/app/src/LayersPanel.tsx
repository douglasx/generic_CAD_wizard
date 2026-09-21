import { useState } from 'react';
import {
  addLayer,
  batch,
  DEFAULT_LAYER,
  deleteLayer,
  layerUsage,
  LINETYPES,
  nextLayerName,
  setCurrentLayer,
  sortedLayers,
  updateEntity,
  updateLayer,
  type CadDocument,
  type Command,
  type Entity,
  type EntityId,
} from '@cadw/core';

const LINEWEIGHTS = [0, 0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0];
const PALETTE = ['#ff5f5f', '#ffb347', '#ffe066', '#7bd88f', '#4fc3f7', '#8f9bff', '#e38fff', '#e6e6e6'];

interface Props {
  doc: CadDocument;
  selection: ReadonlySet<EntityId>;
  exec(command: Command): boolean;
  newId(prefix: string): string;
}

/**
 * Layers and selection properties (REQ-003.8). Every change goes through a
 * Command, so it is undoable like any drawing edit.
 */
export function LayersPanel({ doc, selection, exec, newId }: Props) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const usage = layerUsage(doc);
  const layers = sortedLayers(doc);
  const selected = [...selection].map((id) => doc.entities[id]).filter((e): e is Entity => !!e);

  const create = () => {
    const id = newId('layer');
    const name = nextLayerName(doc);
    const color = PALETTE[Object.keys(doc.layers).length % PALETTE.length]!;
    if (exec(addLayer({ ...DEFAULT_LAYER, id, name, color }))) {
      setRenaming(id);
      setDraft(name);
    }
  };
  const commitRename = (id: string) => {
    const layer = doc.layers[id];
    if (layer && draft.trim() && draft.trim() !== layer.name) exec(updateLayer(id, { name: draft }));
    setRenaming(null);
  };
  const moveSelection = (layerId: string) =>
    exec(batch(selected.map((e) => updateEntity({ ...e, layer: layerId })), 'move to layer'));
  const setSelectionColor = (color: string | null) =>
    exec(
      batch(
        selected.map((e) => {
          const { color: _old, ...rest } = e.style ?? {};
          const style = color ? { ...rest, color } : rest;
          const { style: _s, ...bare } = e;
          return updateEntity((Object.keys(style).length ? { ...bare, style } : bare) as Entity);
        }),
        'colour',
      ),
    );

  const selLayers = new Set(selected.map((e) => e.layer));
  const selColors = new Set(selected.map((e) => e.style?.color ?? 'bylayer'));

  return (
    <aside className="panel" aria-label="Layers and properties">
      <section>
        <header className="panel-head">
          <h2>Layers</h2>
          <button onClick={create} title="New layer" aria-label="New layer">+ New</button>
        </header>
        <table className="layers" data-testid="layers-table">
          <thead>
            <tr>
              <th title="Current layer">Cur</th>
              <th>Name</th>
              <th title="Visible">On</th>
              <th title="Locked">Lock</th>
              <th title="Colour">Col</th>
              <th title="Lineweight (mm)">LW</th>
              <th title="Linetype">Type</th>
              <th title="Objects">#</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => {
              const count = usage[l.id] ?? 0;
              const canDelete = l.id !== DEFAULT_LAYER.id && l.id !== doc.currentLayer && count === 0;
              return (
                <tr key={l.id} data-layer={l.name} className={l.id === doc.currentLayer ? 'current' : ''}>
                  <td>
                    <input type="radio" name="current-layer" aria-label={`Make ${l.name} current`} checked={l.id === doc.currentLayer} onChange={() => exec(setCurrentLayer(l.id))} />
                  </td>
                  <td className="name" onDoubleClick={() => (setRenaming(l.id), setDraft(l.name))} title="Double-click to rename">
                    {renaming === l.id ? (
                      <input
                        autoFocus
                        aria-label="Layer name"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => commitRename(l.id)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') commitRename(l.id);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                    ) : (
                      l.name
                    )}
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${l.name} visible`} checked={l.visible} onChange={() => exec(updateLayer(l.id, { visible: !l.visible }))} />
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`${l.name} locked`} checked={l.locked} onChange={() => exec(updateLayer(l.id, { locked: !l.locked }))} />
                  </td>
                  <td>
                    <input type="color" aria-label={`${l.name} colour`} value={l.color} onChange={(e) => exec(updateLayer(l.id, { color: e.target.value }))} />
                  </td>
                  <td>
                    <select aria-label={`${l.name} lineweight`} value={l.lineweightMm} onChange={(e) => exec(updateLayer(l.id, { lineweightMm: Number(e.target.value) }))}>
                      {LINEWEIGHTS.map((w) => (
                        <option key={w} value={w}>
                          {w.toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`${l.name} linetype`} value={l.linetype} onChange={(e) => exec(updateLayer(l.id, { linetype: e.target.value }))}>
                      {Object.keys(LINETYPES).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="count">{count}</td>
                  <td>
                    <button
                      className="del"
                      aria-label={`Delete ${l.name}`}
                      disabled={!canDelete}
                      title={canDelete ? 'Delete layer' : l.id === DEFAULT_LAYER.id ? 'Layer 0 cannot be deleted' : count ? 'Layer has objects' : 'Current layer'}
                      onClick={() => exec(deleteLayer(l.id))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section data-testid="properties">
        <header className="panel-head">
          <h2>Properties</h2>
        </header>
        {selected.length === 0 ? (
          <p className="muted">Nothing selected.</p>
        ) : (
          <dl className="props">
            <dt>Selected</dt>
            <dd>
              {selected.length} ({[...new Set(selected.map((e) => e.kind))].join(', ')})
            </dd>
            <dt>Layer</dt>
            <dd>
              <select aria-label="Selection layer" value={selLayers.size === 1 ? [...selLayers][0] : ''} onChange={(e) => e.target.value && moveSelection(e.target.value)}>
                {selLayers.size > 1 && <option value="">(varies)</option>}
                {layers.map((l) => (
                  <option key={l.id} value={l.id} disabled={l.locked}>
                    {l.name}
                  </option>
                ))}
              </select>
            </dd>
            <dt>Colour</dt>
            <dd className="colour-row">
              <label>
                <input type="checkbox" checked={selColors.size === 1 && selColors.has('bylayer')} onChange={(e) => setSelectionColor(e.target.checked ? null : '#ffffff')} />
                ByLayer
              </label>
              {!(selColors.size === 1 && selColors.has('bylayer')) && (
                <input type="color" aria-label="Selection colour" value={selColors.size === 1 ? [...selColors][0] : '#ffffff'} onChange={(e) => setSelectionColor(e.target.value)} />
              )}
            </dd>
          </dl>
        )}
      </section>
    </aside>
  );
}
