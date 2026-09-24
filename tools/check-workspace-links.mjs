#!/usr/bin/env node
/**
 * Fails fast with a clear message when node_modules is older than package.json
 * — the usual cause of "Failed to resolve import @cadw/… " after a git pull.
 * Runs before dev, build and test.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const missing = [];

for (const pkg of readdirSync(join(root, 'packages'))) {
  const dir = join(root, 'packages', pkg);
  const manifest = join(dir, 'package.json');
  if (!existsSync(manifest)) continue;
  const json = JSON.parse(readFileSync(manifest, 'utf8'));
  const deps = { ...json.dependencies, ...json.devDependencies };
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === 'string' && spec.startsWith('workspace:') && !existsSync(join(dir, 'node_modules', name))) {
      missing.push(`  packages/${pkg} → ${name}`);
    }
  }
}

if (missing.length > 0) {
  console.error(
    `\nDependencies are not installed for ${missing.length} workspace link${missing.length === 1 ? '' : 's'}:\n${missing.join('\n')}\n\nRun:  pnpm install\n(package.json changed since your last install — pnpm creates these links then.)\n`,
  );
  process.exit(1);
}
