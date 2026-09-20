import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { addEntity, createDocument, History, sequentialIds, type EntityId } from '@cadw/core';
import { CadwError, readCadw, writeCadw } from '../src/index.ts';

function sample() {
  const ids = sequentialIds();
  const h = new History(createDocument('Deck plan'));
  for (let i = 0; i < 3; i++)
    h.execute(addEntity({ id: ids.next('e') as EntityId, kind: 'line', layer: '0', start: [i, 0, 0], end: [i, 100.125, 0] }));
  return h.doc;
}

describe('.cadw', () => {
  it('round-trips a document exactly', () => {
    const doc = sample();
    expect(readCadw(writeCadw(doc))).toEqual(doc);
  });

  it('is byte-for-byte deterministic', () => {
    const doc = sample();
    expect(writeCadw(doc)).toEqual(writeCadw(doc));
  });

  it('rejects garbage, wrong format and future versions', () => {
    expect(() => readCadw(new Uint8Array([1, 2, 3]))).toThrow(CadwError);
    const wrong = zipSync({ 'manifest.json': strToU8('{"format":"other","formatVersion":1}'), 'document.json': strToU8('{}') });
    expect(() => readCadw(wrong)).toThrow(/Not a .cadw/);
    const future = zipSync({ 'manifest.json': strToU8('{"format":"cadw","formatVersion":99}'), 'document.json': strToU8('{}') });
    expect(() => readCadw(future)).toThrow(/Unsupported/);
  });
});
