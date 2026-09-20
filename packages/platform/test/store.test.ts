import { describe, expect, it } from 'vitest';
import { MemoryStore, type KeyValueStore } from '../src/index.ts';

/** Contract every KeyValueStore implementation must meet (web, desktop). */
export async function storeContract(store: KeyValueStore) {
  expect(await store.get('missing')).toBeNull();
  const data = new Uint8Array([1, 2, 3]);
  await store.set('k', data);
  data[0] = 9; // callers may reuse buffers
  expect(Array.from((await store.get('k'))!)).toEqual([1, 2, 3]);
  await store.delete('k');
  expect(await store.get('k')).toBeNull();
}

describe('KeyValueStore contract', () => {
  it('MemoryStore', async () => storeContract(new MemoryStore()));
});
