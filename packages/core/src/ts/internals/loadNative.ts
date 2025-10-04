// Native addon loader resilient to bundling (Electron + Vite) & ESM context.
// Strategy:
// 1. Compute absolute path from this file (dist/internals/ -> ../build/Release/pruftcore.node)
// 2. Allow override via PRUFTCORE_NATIVE_PATH
// 3. Fallback: monorepo relative path from process.cwd() (dev scenario)
// 4. Provide clear error listing attempted locations.

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'node:path';
import fs from 'node:fs';

const requireNative = createRequire(import.meta.url);

function tryPath(p: string): string | null {
  try {
    if (p && fs.existsSync(p)) return p;
  } catch (_) {
    /* ignore */
  }
  return null;
}

export function loadNative(): any {
  if (typeof process === 'undefined' || !process.versions?.node) {
    throw new Error('@repo/core: native addon can only be loaded in a Node.js environment');
  }

  const attempted: string[] = [];

  // 1. Path derived from this compiled file location
  const thisFile = fileURLToPath(import.meta.url); // .../packages/core/dist/internals/loadNative.js
  const distInternalsDir = path.dirname(thisFile);
  const distRoot = path.resolve(distInternalsDir, '..'); // .../dist
  const candidateFromDist = path.resolve(distRoot, '..', 'build', 'Release', 'pruftcore.node');
  attempted.push(candidateFromDist);

  // 2. Environment override
  if (process.env.PRUFTCORE_NATIVE_PATH) {
    attempted.push(process.env.PRUFTCORE_NATIVE_PATH);
  }

  // 3. Fallback: monorepo style (when executed from repo root in dev & bundler rewrites paths)
  const cwdFallback = path.resolve(process.cwd(), 'packages', 'core', 'build', 'Release', 'pruftcore.node');
  attempted.push(cwdFallback);

  // 4. (Future) If we ever copy the .node beside dist outputs
  const siblingInDist = path.resolve(distRoot, 'pruftcore.node');
  attempted.push(siblingInDist);

  let resolved: string | null = null;
  for (const p of attempted) {
    const ok = tryPath(p);
    if (ok) {
      resolved = ok;
      break;
    }
  }

  if (!resolved) {
    throw new Error(
      `@repo/core: Could not locate native addon (pruftcore.node). Tried:\n` +
      attempted.map(p => ` - ${p}`).join('\n') +
      `\nMake sure you ran: pnpm run build:core\n` +
      `Or set PRUFTCORE_NATIVE_PATH to the built addon file.`
    );
  }

  if (process.env.PRUFTCORE_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[pruftcore] loading native addon from', resolved);
  }

  return requireNative(resolved);
}
