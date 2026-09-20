import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addEntity,
  createDocument,
  entityList,
  History,
  randomIds,
  type CadDocument,
  type EntityId,
  type Vec3,
} from '@cadw/core';
import { findSnap, type Segment } from '@cadw/geom2d';
import { readCadw, writeCadw } from '@cadw/io-native';
import { CADW_FILE, type PlatformAdapter } from '@cadw/platform';
import { Viewport, type ViewName } from '@cadw/render';
import { getKernel } from './kernel-session.ts';

const AUTOSAVE_KEY = 'autosave.cadw';
const SNAP_PIXELS = 10;
type Tool = 'select' | 'line';

export function App({ platform }: { platform: PlatformAdapter }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const historyRef = useRef(new History(createDocument()));
  const [doc, setDoc] = useState<CadDocument>(historyRef.current.doc);
  const [tool, setTool] = useState<Tool>('line');
  const [start, setStart] = useState<Vec3 | null>(null);
  const [cursor, setCursor] = useState<Vec3>([0, 0, 0]);
  const [online, setOnline] = useState(navigator.onLine);
  const [kernelStatus, setKernelStatus] = useState('Kernel not loaded');
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState(false);
  const [view, setView] = useState<ViewName>('top');
  const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  // Viewport lifecycle
  useEffect(() => {
    const vp = new Viewport(hostRef.current!);
    viewportRef.current = vp;
    return () => vp.dispose();
  }, []);

  // Restore autosave (works offline: IndexedDB)
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

  // History → React state, viewport and autosave
  useEffect(() => {
    const h = historyRef.current;
    const onChange = (d: CadDocument) => {
      setDoc(d);
      viewportRef.current?.setDocument(d);
      setAutosave('saving');
      // Serialize writes so the latest document always wins.
      saveChain.current = saveChain.current
        .then(() => platform.storage.set(AUTOSAVE_KEY, writeCadw(d)))
        .then(
          () => setAutosave(historyRef.current.doc === d ? 'saved' : 'saving'),
          () => setAutosave('error'),
        );
    };
    viewportRef.current?.setDocument(h.doc);
    return h.subscribe(onChange);
  }, [platform]);

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

  const snapped = useCallback(
    (p: Vec3): Vec3 => {
      const vp = viewportRef.current;
      if (!vp) return p;
      const segments: Segment[] = entityList(historyRef.current.doc).map((e) => ({
        start: [e.start[0], e.start[1]],
        end: [e.end[0], e.end[1]],
      }));
      const s = findSnap([p[0], p[1]], segments, SNAP_PIXELS * vp.unitsPerPixel);
      return s ? [s.point[0], s.point[1], 0] : p;
    },
    [],
  );

  const onPointerMove = (ev: React.PointerEvent) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const p = snapped(vp.screenToModel(ev.clientX, ev.clientY));
    setCursor(p);
    if (tool === 'line' && start) vp.setPreview(start, p);
  };

  const onPointerDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0 || tool !== 'line') return;
    const vp = viewportRef.current;
    if (!vp) return;
    const p = snapped(vp.screenToModel(ev.clientX, ev.clientY));
    if (!start) {
      setStart(p);
      return;
    }
    if (Math.hypot(p[0] - start[0], p[1] - start[1]) > 1e-9) {
      historyRef.current.execute(
        addEntity({ id: randomIds.next('line') as EntityId, kind: 'line', layer: '0', start, end: p }),
      );
    }
    setStart(null);
    vp.setPreview(null, null);
  };

  const cancel = useCallback(() => {
    setStart(null);
    viewportRef.current?.setPreview(null, null);
  }, []);

  const undo = useCallback(() => historyRef.current.undo(), []);
  const redo = useCallback(() => historyRef.current.redo(), []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
      } else if (mod && ev.key.toLowerCase() === 'y') {
        ev.preventDefault();
        redo();
      } else if (ev.key === 'Escape') cancel();
      else if (!mod && ev.key.toLowerCase() === 'l') setTool('line');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, cancel]);

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
      historyRef.current.reset(readCadw(file.bytes));
      setMessage(`Opened ${file.name}`);
    } catch (e) {
      setMessage(`Open failed: ${(e as Error).message}`);
    }
  };

  const newDoc = () => {
    cancel();
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
  return (
    <div className="app" data-ready={restored ? 'true' : 'false'}>
      <header className="toolbar">
        <strong className="brand">CAD Wizard</strong>
        <button aria-pressed={tool === 'line'} onClick={() => setTool('line')} title="Line (L)">Line</button>
        <button aria-pressed={tool === 'select'} onClick={() => { cancel(); setTool('select'); }}>Select</button>
        <span className="sep" />
        <button onClick={undo} disabled={!h.canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={redo} disabled={!h.canRedo} title="Redo (Ctrl+Y)">Redo</button>
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
      />
      <footer className="status">
        <span data-testid="entity-count">{entityList(doc).length} entities</span>
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
