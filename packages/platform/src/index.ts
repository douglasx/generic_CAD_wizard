/**
 * PlatformAdapter — everything that differs between web and desktop.
 * The app never calls browser or OS file APIs directly.
 */
export interface FileType {
  readonly description: string;
  readonly extensions: readonly string[]; // e.g. ['.cadw']
  readonly mime: string;
}

export interface OpenedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface KeyValueStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PlatformAdapter {
  readonly kind: 'web' | 'desktop';
  /** Returns the saved file name/path, or null if the user cancelled. */
  saveFile(suggestedName: string, bytes: Uint8Array, type: FileType): Promise<string | null>;
  /** Returns the chosen file, or null if the user cancelled. */
  openFile(type: FileType): Promise<OpenedFile | null>;
  /** Durable local storage for autosave and settings; works offline. */
  readonly storage: KeyValueStore;
}

export const CADW_FILE: FileType = {
  description: 'CAD Wizard drawing',
  extensions: ['.cadw'],
  mime: 'application/vnd.cadwizard+zip',
};

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, Uint8Array>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: Uint8Array) {
    this.map.set(key, value.slice());
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

/** True inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
