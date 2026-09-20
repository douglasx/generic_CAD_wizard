import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { migrateDocument, type CadDocument } from '@cadw/core';

/**
 * `.cadw` = zip of `manifest.json` + `document.json` (+ `shapes/*.brep` from M5).
 * Human-readable and diff-able; timestamps fixed so identical documents give
 * identical bytes.
 */
export const CADW_FORMAT_VERSION = 1;
const FIXED_MTIME = new Date('2000-01-01T00:00:00Z');

export interface CadwManifest {
  readonly format: 'cadw';
  readonly formatVersion: number;
  readonly generator: string;
}

export class CadwError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CadwError';
  }
}

export function writeCadw(doc: CadDocument, generator = 'cad-wizard'): Uint8Array {
  const manifest: CadwManifest = { format: 'cadw', formatVersion: CADW_FORMAT_VERSION, generator };
  return zipSync(
    {
      'manifest.json': [strToU8(JSON.stringify(manifest, null, 2)), { mtime: FIXED_MTIME }],
      'document.json': [strToU8(JSON.stringify(doc, null, 2)), { mtime: FIXED_MTIME }],
    },
    { level: 6 },
  );
}

export function readCadw(bytes: Uint8Array): CadDocument {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new CadwError('Not a .cadw file (zip could not be read)');
  }
  const manifestBytes = files['manifest.json'];
  const docBytes = files['document.json'];
  if (!manifestBytes || !docBytes) throw new CadwError('Missing manifest.json or document.json');
  const manifest = JSON.parse(strFromU8(manifestBytes)) as Partial<CadwManifest>;
  if (manifest.format !== 'cadw') throw new CadwError('Not a .cadw file');
  if (typeof manifest.formatVersion !== 'number' || manifest.formatVersion > CADW_FORMAT_VERSION) {
    throw new CadwError(`Unsupported .cadw format version ${String(manifest.formatVersion)}`);
  }
  return migrateDocument(JSON.parse(strFromU8(docBytes)));
}
