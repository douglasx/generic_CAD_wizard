import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import type { FileType, OpenedFile, PlatformAdapter } from './index.ts';
import { IndexedDbStore } from './web.ts';

/** Desktop implementation: native dialogs and direct file access through Tauri 2. */
export function createTauriPlatform(): PlatformAdapter {
  const filters = (t: FileType) => [{ name: t.description, extensions: t.extensions.map((e) => e.replace(/^\./, '')) }];
  return {
    kind: 'desktop',
    storage: new IndexedDbStore(),

    async saveFile(name, bytes, type) {
      const path = await save({ defaultPath: name, filters: filters(type) });
      if (!path) return null;
      await writeFile(path, bytes);
      return path;
    },

    async openFile(type): Promise<OpenedFile | null> {
      const path = await open({ multiple: false, directory: false, filters: filters(type) });
      if (!path || Array.isArray(path)) return null;
      const bytes = await readFile(path);
      return { name: path.split(/[\\/]/).pop() ?? path, bytes };
    },
  };
}
