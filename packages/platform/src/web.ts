import type { FileType, KeyValueStore, OpenedFile, PlatformAdapter } from './index.ts';
import { MemoryStore } from './index.ts';

/** IndexedDB key-value store; falls back to memory if IndexedDB is unavailable. */
export class IndexedDbStore implements KeyValueStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private readonly dbName: string;
  private readonly storeName: string;

  constructor(dbName = 'cad-wizard', storeName = 'kv') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = run(db.transaction(this.storeName, mode).objectStore(this.storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async get(key: string): Promise<Uint8Array | null> {
    const v = await this.tx<unknown>('readonly', (s) => s.get(key));
    return v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : null;
  }
  async set(key: string, value: Uint8Array): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}

export interface WebPlatformOptions {
  /** Use the File System Access API when the browser has it (default true). */
  readonly useFilePickers?: boolean;
}

type PickerWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<{ name: string; createWritable(): Promise<{ write(d: BufferSource): Promise<void>; close(): Promise<void> }> }>;
  showOpenFilePicker?: (o: unknown) => Promise<Array<{ getFile(): Promise<File> }>>;
};

function pickerTypes(type: FileType) {
  return [{ description: type.description, accept: { [type.mime]: [...type.extensions] } }];
}

export function createWebPlatform(options: WebPlatformOptions = {}): PlatformAdapter {
  const w = window as PickerWindow;
  const pickers = (options.useFilePickers ?? true) && typeof w.showSaveFilePicker === 'function';
  const storage: KeyValueStore = typeof indexedDB !== 'undefined' ? new IndexedDbStore() : new MemoryStore();

  return {
    kind: 'web',
    storage,

    async saveFile(name, bytes, type) {
      if (pickers && w.showSaveFilePicker) {
        try {
          const handle = await w.showSaveFilePicker({ suggestedName: name, types: pickerTypes(type) });
          const out = await handle.createWritable();
          await out.write(bytes as BufferSource);
          await out.close();
          return handle.name;
        } catch (e) {
          if ((e as DOMException).name === 'AbortError') return null;
          throw e;
        }
      }
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: type.mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return name;
    },

    async openFile(type): Promise<OpenedFile | null> {
      if (pickers && w.showOpenFilePicker) {
        try {
          const [handle] = await w.showOpenFilePicker({ types: pickerTypes(type), multiple: false });
          if (!handle) return null;
          const file = await handle.getFile();
          return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
        } catch (e) {
          if ((e as DOMException).name === 'AbortError') return null;
          throw e;
        }
      }
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = type.extensions.join(',');
        input.onchange = async () => {
          const file = input.files?.[0];
          resolve(file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null);
        };
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },
  };
}
