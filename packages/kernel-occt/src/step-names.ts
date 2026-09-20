/**
 * libcascade does not expose iteration over TDataStd_NamedData, so we collect
 * candidate attribute names from the STEP text and query each one.
 * Names come from representation items, which is where OCCT writes them.
 */
const ITEM_RE = /(?:DESCRIPTIVE|INTEGER|REAL|VALUE|MEASURE|BOOLEAN)_REPRESENTATION_ITEM\s*\(\s*'((?:[^']|'')*)'/g;
const PROP_RE = /PROPERTY_DEFINITION\s*\(\s*'((?:[^']|'')*)'/g;

export function candidateAttributeNames(step: string): string[] {
  const names = new Set<string>();
  for (const re of [ITEM_RE, PROP_RE]) {
    for (const m of step.matchAll(re)) {
      const name = (m[1] ?? '').replace(/''/g, "'");
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * OCCT writes non-ASCII attribute text to STEP as raw UTF-8 but reads
 * representation-item text back as Latin-1. If a string is pure Latin-1 and
 * its bytes form valid UTF-8, decode it as UTF-8. Genuine Latin-1 text is not
 * valid UTF-8 and is returned unchanged.
 */
export function repairUtf8(s: string): string {
  let high = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) return s;
    if (c >= 0x80) high = true;
  }
  if (!high) return s;
  const bytes = Uint8Array.from(s, (ch) => ch.charCodeAt(0));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}
