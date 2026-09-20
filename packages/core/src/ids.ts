export type EntityId = string & { readonly __brand: 'EntityId' };

export interface IdGenerator {
  next(prefix: string): string;
}

/** Random UUID-based ids for interactive use. */
export const randomIds: IdGenerator = {
  next: (prefix) => `${prefix}_${globalThis.crypto.randomUUID()}`,
};

/** Deterministic ids for tests and headless regeneration (guardrail 13). */
export function sequentialIds(start = 1): IdGenerator {
  let n = start;
  return { next: (prefix) => `${prefix}_${n++}` };
}
