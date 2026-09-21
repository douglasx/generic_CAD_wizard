import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createDocument, entityList, History, randomIds, updateEntity, visibleEntities, type CadDocument, type EntityId, type Vec3 } from '@cadw/core';
import { boxFrom, crossingSelect, gripsOf, moveGrip, pickEntity, windowSelect, type Snap, type Vec2 } from '@cadw/geom2d';
import { readCadw, writeCadw } from '@cadw/io-native';
import { CADW_FILE, type PlatformAdapter } from '@cadw/platform';
import { Viewport, type ViewName } from '@cadw/render';
import { CommandLine, type CommandLineHandle } from './CommandLine.tsx';
import { DEFAULT_SETTINGS, parseSettings, resolveCursor, SNAP_LABELS, type DraftSettings } from './cursor.ts';
import { DraftingBar } from './DraftingBar.tsx';
import { combineSelection, EMPTY_SELECTION, pruneSelection, type Selection } from './selection.ts';
import { DRAW_TOOLS } from './commands/draw-tools.ts';
import { CommandSession } from './commands/session.ts';
import { getKernel } from './kernel-session.ts';

const AUTOSAVE_KEY = 'autosave.cadw';
const SETTINGS_KEY = 'settings.json';
const PICK_PIXELS = 5;
const GRIP_PIXELS = 7;
const DRAG_PIXELS = 4;

type Gesture =
  | { kind: 'box'; downScreen: Vec2; downModel: Vec2; shift: boolean; dragging: boolean }
  | { kind: 'grip'; id: EntityId; index: number; from: Vec2 }
  | null;

export function App({ platform }: { platform: PlatformAdapter }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const cmdRef = useRef<CommandLineHandle>(null);
  const historyRef = useRef(new History(createDocument()));
  const session = useMemo(() => new CommandSession(historyRef.current, randomIds, DRAW_TOOLS), []);
  // Re-render whenever the session changes; read the live snapshot below.
  useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.version,
  );
  const [doc, setDoc] = useState<CadDocument>(historyRef.current.doc);
  const cursorRef = useRef<Vec2>([0, 0]);
  const [cursor, setCursor] = useState<Vec3>([0, 0, 0]);
  const [online, setOnline] = useState(navigator.onLine);
  const [kernelStatus, setKernelStatus] = useState('Kernel not loaded');
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<ViewName>('top');
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const [settings, setSettings] = useState<DraftSettings>(DEFAULT_SETTINGS);
  const settingsRef = useRef(settings);
  const rawCursorRef = useRef<Vec2>([0, 0]);
  const [snapHit, setSnapHit] = useState<Snap | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const selectionRef = useRef<Selection>(EMPTY_SELECTION);
  const gestureRef = useRef<Gesture>(null);
  const selectionChanged = useCallback((next: Selection) => {
    selectionRef.current = next;
    setSelection(next);
  }, []);

  // Drafting settings persist per device (IndexedDB via the platform adapter).
  useEffect(() => {
    platform.storage
      .get(SETTINGS_KEY)
      .then((b) => b && setSettings(parseSettings(new TextDecoder().decode(b))))
      .catch(() => {});
  }, [platform]);
  const changeSettings = useCallback(
    (next: DraftSettings) => {
      setSettings(next);
      void platform.storage.set(SETTINGS_KEY, new TextEncoder().encode(JSON.stringify(next))).catch(() => {});
    },
    [platform],
  );
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Test hook for e2e: read the live document (only under automation).
  useEffect(() => {
    if (navigator.webdriver)
      (window as unknown as { __cadw: unknown }).__cadw = {
        doc: () => historyRef.current.doc,
        toScreen: (x: number, y: number) => viewportRef.current?.modelToScreen(x, y),
        selection: () => [...selectionRef.current],
      };
  }, []);

  useEffect(() => {
    const vp = new Viewport(hostRef.current!);
    viewportRef.current = vp;
    return () => vp.dispose();
  }, []);

  useEffect(() => {
    let cancelled = false;
    platform.storage
      .get(AUTOSAVE_KEY)
      .then((bytes) => {
        if (cancelled || !bytes) return;
        historyRef.current.reset(readCadw(bytes));
        setMessage('Restored last drawing');
      })
      .catch((e) => setMessage(`Could not restore autosave: ${(e as Error).message}`))
      .finally(() => !cancelled && setRestored(true));
    return () => {
      cancelled = true;
    };
  }, [platform]);

  useEffect(() => {
    const h = historyRef.current;
    const onChange = (d: CadDocument) => {
      setDoc(d);
      const pruned = pruneSelection(selectionRef.current, d);
      if (pruned !== selectionRef.current) selectionChanged(pruned);
      viewportRef.current?.setDocument(d);
      setAutosave('saving');
      saveChain.current = saveChain.current
        .then(() => platform.storage.set(AUTOSAVE_KEY, writeCadw(d)))
        .then(
          () => setAutosave(historyRef.current.doc === d ? 'saved' : 'saving'),
          () => setAutosave('error'),
        );
    };
    viewportRef.current?.setDocument(h.doc);
    return h.subscribe(onChange);
  }, [platform, selectionChanged]);

  // Selection highlight and grips follow the selection and the document.
  const gripPoints = useCallback((): Vec2[] => {
    const d = historyRef.current.doc;
    return [...selectionRef.current].flatMap((id) => {
      const e = d.entities[id];
      return e ? gripsOf(e).map((g) => g.point) : [];
    });
  }, []);
  useEffect(() => {
    viewportRef.current?.setSelection(selection);
    viewportRef.current?.setGrips(gripPoints());
  }, [selection, doc, gripPoints]);

  // Keep the rubber band in step with the active tool.
  useEffect(
    () =>
      session.subscribe(() => {
        viewportRef.current?.setPreviewEntities(session.preview(cursorRef.current));
      }),
    [session],
  );

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  /** Raw model point → snapped/ortho/grid point, updating the snap marker. */
  const resolve = useCallback(
    (raw: Vec2): Vec2 => {
      const vp = viewportRef.current;
      if (!vp) return raw;
      const r = resolveCursor(raw, entityList(historyRef.current.doc), settingsRef.current, session.lastPoint, vp.unitsPerPixel);
      vp.setSnapMarker(r.snap);
      setSnapHit(r.snap);
      return r.point;
    },
    [session],
  );

  const modelAt = (ev: React.PointerEvent): Vec2 => {
    const m = viewportRef.current!.screenToModel(ev.clientX, ev.clientY);
    return [m[0], m[1]];
  };

  /** Grip under the cursor, among the selected entities. */
  const gripAt = (p: Vec2): { id: EntityId; index: number; point: Vec2 } | null => {
    const vp = viewportRef.current;
    if (!vp) return null;
    const r = GRIP_PIXELS * vp.unitsPerPixel;
    const d = historyRef.current.doc;
    let best: { id: EntityId; index: number; point: Vec2; dist: number } | null = null;
    for (const id of selectionRef.current) {
      const e = d.entities[id];
      if (!e) continue;
      for (const g of gripsOf(e)) {
        const dist = Math.hypot(g.point[0] - p[0], g.point[1] - p[1]);
        if (dist <= r && (!best || dist < best.dist)) best = { id, index: g.index, point: g.point, dist };
      }
    }
    return best;
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const raw = modelAt(ev);
    rawCursorRef.current = raw;
    const g = gestureRef.current;

    if (g?.kind === 'grip') {
      // Snap while dragging, ignoring the entity being edited so it cannot snap to itself.
      const d = historyRef.current.doc;
      const others = entityList(d).filter((e) => e.id !== g.id);
      const r = resolveCursor(raw, others, settingsRef.current, g.from, vp.unitsPerPixel);
      vp.setSnapMarker(r.snap);
      setSnapHit(r.snap);
      const e = d.entities[g.id];
      const edited = e ? moveGrip(e, g.index, r.point) : null;
      vp.setPreviewEntities(edited ? [edited] : []);
      cursorRef.current = r.point;
      setCursor([r.point[0], r.point[1], 0]);
      return;
    }

    if (g?.kind === 'box') {
      const moved = Math.hypot(ev.clientX - g.downScreen[0], ev.clientY - g.downScreen[1]);
      if (moved > DRAG_PIXELS) g.dragging = true;
      if (g.dragging) vp.setSelectionBox(boxFrom(g.downModel, raw), ev.clientX < g.downScreen[0]);
      setCursor([raw[0], raw[1], 0]);
      return;
    }

    if (session.snapshot.activeTool) {
      const p = resolve(raw);
      cursorRef.current = p;
      setCursor([p[0], p[1], 0]);
      vp.setPreviewEntities(session.preview(p));
    } else {
      // Idle: no snap markers; highlight a grip under the cursor.
      vp.setSnapMarker(null);
      setSnapHit(null);
      cursorRef.current = raw;
      setCursor([raw[0], raw[1], 0]);
      const hot = gripAt(raw);
      const pts = gripPoints();
      vp.setGrips(pts, hot ? pts.findIndex((q) => q[0] === hot.point[0] && q[1] === hot.point[1]) : -1);
    }
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    const vp = viewportRef.current;
    if (!vp) return;
    const raw = modelAt(ev);

    if (session.snapshot.activeTool) {
      const p = resolve(raw);
      cursorRef.current = p;
      session.point(p);
      return;
    }
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    // Shift always edits the selection, even over a grip.
    const grip = ev.shiftKey ? null : gripAt(raw);
    if (grip) {
      gestureRef.current = { kind: 'grip', id: grip.id, index: grip.index, from: grip.point };
      return;
    }
    gestureRef.current = { kind: 'box', downScreen: [ev.clientX, ev.clientY], downModel: raw, shift: ev.shiftKey, dragging: false };
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const vp = viewportRef.current;
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!vp || !g) return;

    if (g.kind === 'grip') {
      vp.setPreviewEntities([]);
      vp.setSnapMarker(null);
      setSnapHit(null);
      const e = historyRef.current.doc.entities[g.id];
      const edited = e ? moveGrip(e, g.index, cursorRef.current) : null;
      if (!edited) {
        setMessage('That grip edit would make the entity degenerate');
        return;
      }
      if (JSON.stringify(edited) === JSON.stringify(e)) return;
      try {
        historyRef.current.execute(updateEntity(edited));
      } catch (err) {
        setMessage((err as Error).message);
      }
      return;
    }

    const d = historyRef.current.doc;
    const tol = vp.unitsPerPixel * 0.25;
    const candidates = visibleEntities(d).filter((e) => !d.layers[e.layer]?.locked);
    if (g.dragging) {
      vp.setSelectionBox(null);
      const box = boxFrom(g.downModel, modelAt(ev));
      const crossing = ev.clientX < g.downScreen[0];
      const hits = crossing ? crossingSelect(box, candidates, tol) : windowSelect(box, candidates, tol);
      selectionChanged(combineSelection(selectionRef.current, hits, g.shift ? 'add' : 'replace'));
    } else {
      const hit = pickEntity(g.downModel, candidates, PICK_PIXELS * vp.unitsPerPixel, tol);
      if (hit) selectionChanged(combineSelection(selectionRef.current, [hit], g.shift ? 'toggle' : 'replace'));
      else if (!g.shift) selectionChanged(EMPTY_SELECTION);
    }
  };

  // Settings changes re-resolve the cursor so ortho/snap take effect immediately.
  useEffect(() => {
    const p = resolve(rawCursorRef.current);
    cursorRef.current = p;
    viewportRef.current?.setPreviewEntities(session.preview(p));
  }, [settings, resolve, session]);

  // Keyboard: typing anywhere goes to the command line (AutoCAD behaviour).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      // Drafting toggles work everywhere, including while typing a command.
      const cur = settingsRef.current;
      if (ev.key === 'F3') {
        ev.preventDefault();
        changeSettings({ ...cur, osnap: !cur.osnap });
        return;
      }
      if (ev.key === 'F8') {
        ev.preventDefault();
        changeSettings({ ...cur, ortho: !cur.ortho });
        return;
      }
      if (ev.key === 'F9') {
        ev.preventDefault();
        changeSettings({ ...cur, gridSnap: !cur.gridSnap });
        return;
      }
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) session.redo();
        else session.undo();
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        session.redo();
      } else if (ev.key === 'Escape') {
        if (session.snapshot.activeTool) session.cancel();
        else selectionChanged(EMPTY_SELECTION);
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        session.enter();
      } else if (!mod && !ev.altKey && ev.key.length === 1) {
        ev.preventDefault();
        cmdRef.current?.typeKey(ev.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, changeSettings, selectionChanged]);

  const save = async () => {
    try {
      const name = await platform.saveFile(`${doc.name}.cadw`, writeCadw(doc), CADW_FILE);
      if (name) setMessage(`Saved ${name}`);
    } catch (e) {
      setMessage(`Save failed: ${(e as Error).message}`);
    }
  };

  const openFile = async () => {
    try {
      const file = await platform.openFile(CADW_FILE);
      if (!file) return;
      session.cancel();
      historyRef.current.reset(readCadw(file.bytes));
      setMessage(`Opened ${file.name}`);
    } catch (e) {
      setMessage(`Open failed: ${(e as Error).message}`);
    }
  };

  const newDoc = () => {
    session.cancel();
    historyRef.current.reset(createDocument());
    viewportRef.current?.setMeshes([]);
    setMessage('New drawing');
  };

  const kernelCheck = async () => {
    setKernelStatus('Loading kernel…');
    const t0 = performance.now();
    try {
      const k = getKernel();
      const info = await k.info();
      const box = await k.makeBox(200, 100, 50);
      const volume = await k.volume(box);
      const mesh = await k.tessellate(box);
      await k.release([box]);
      viewportRef.current?.setMeshes([mesh]);
      setView('iso');
      viewportRef.current?.setView('iso');
      setKernelStatus(
        `${info.name} ${info.version}: box volume ${Math.round(volume).toLocaleString('en-US')} mm³, ${mesh.indices.length / 3} triangles, ${Math.round(performance.now() - t0)} ms`,
      );
    } catch (e) {
      setKernelStatus(`Kernel error: ${(e as Error).message}`);
    }
  };

  const switchView = (v: ViewName) => {
    setView(v);
    viewportRef.current?.setView(v);
  };

  const h = historyRef.current;
  const live = session.snapshot;
  return (
    <div className="app" data-ready={restored ? 'true' : 'false'}>
      <header className="toolbar">
        <strong className="brand">CAD Wizard</strong>
        {DRAW_TOOLS.map((t) => (
          <button key={t.name} aria-pressed={live.activeTool === t.name} onClick={() => session.run(t.name)} title={`${t.label} (${t.aliases.join(', ')})`}>
            {t.label}
          </button>
        ))}
        <button aria-pressed={live.activeTool === null} onClick={() => session.cancel()} title="Select (Esc)">Select</button>
        <span className="sep" />
        <button onClick={() => session.undo()} disabled={!h.canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={() => session.redo()} disabled={!h.canRedo} title="Redo (Ctrl+Y)">Redo</button>
        <span className="sep" />
        <button onClick={newDoc}>New</button>
        <button onClick={openFile}>Open</button>
        <button onClick={save}>Save</button>
        <span className="sep" />
        <button aria-pressed={view === 'top'} onClick={() => switchView('top')}>Top</button>
        <button aria-pressed={view === 'iso'} onClick={() => switchView('iso')}>Iso</button>
        <span className="sep" />
        <button onClick={kernelCheck}>Kernel check</button>
      </header>
      <main
        ref={hostRef}
        className="viewport"
        data-testid="viewport"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      />
      <CommandLine
        ref={cmdRef}
        snapshot={live}
        onSubmit={(text) => session.submit(text, cursorRef.current)}
        onCancel={() => session.cancel()}
      />
      <footer className="status">
        <DraftingBar settings={settings} onChange={changeSettings} />
        <span data-testid="entity-count">{entityList(doc).length} entities</span>
        <span data-testid="selection-count">{selection.size > 0 ? `${selection.size} selected` : ''}</span>
        <span className="snapkind" data-testid="snap-kind">{snapHit ? SNAP_LABELS[snapHit.kind] : ''}</span>
        <span>
          x {cursor[0].toFixed(2)} y {cursor[1].toFixed(2)} mm
        </span>
        <span data-testid="kernel-status">{kernelStatus}</span>
        <span className="msg" data-testid="message">{message}</span>
        <span data-testid="autosave" data-state={autosave}>
          {autosave === 'saved' ? 'Saved locally' : autosave === 'saving' ? 'Saving…' : autosave === 'error' ? 'Autosave failed' : ''}
        </span>
        <span className={online ? 'online' : 'offline'} data-testid="network">{online ? 'Online' : 'Offline'}</span>
        <span>{platform.kind}</span>
      </footer>
    </div>
  );
}
