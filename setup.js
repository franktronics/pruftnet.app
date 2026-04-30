/**
 * Post-install setup script.
 * Run once after cloning or after switching Node versions:
 *   node setup.js
 *
 * What it does:
 *   1. Build better-sqlite3 for Node (web mode)  → cached in build/Release-node/
 *   2. Build better-sqlite3 for Electron          → cached in build/Release-electron/
 *   3. Restore the Node binary to build/Release/  (default for dev:web)
 *   4. Generate the Prisma client (generated/prisma)
 *   5. Apply pending migrations to dev.db
 *
 * Switching runtimes:
 *   node setup.js --web       restore Node binary      (before pnpm dev:web)
 *   node setup.js --desktop   restore Electron binary  (before pnpm dev:desktop)
 */

import { execSync } from 'node:child_process'
import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = import.meta.dirname
const CORE_NODE = resolve(ROOT, 'packages/core-node')
const BETTER_SQLITE3 = resolve(ROOT, 'node_modules/better-sqlite3')
const NODE_GYP = resolve(ROOT, 'node_modules/.bin/node-gyp')
const ELECTRON_REBUILD = resolve(ROOT, 'node_modules/.bin/electron-rebuild')
const DESKTOP = resolve(ROOT, 'apps/desktop')

const RELEASE = resolve(BETTER_SQLITE3, 'build/Release')
const CACHE_NODE = resolve(BETTER_SQLITE3, 'build/Release-node')
const CACHE_ELECTRON = resolve(BETTER_SQLITE3, 'build/Release-electron')
const BINARY = 'better_sqlite3.node'

function run(cmd, opts = {}) {
    console.log(`\n> ${cmd}`)
    execSync(cmd, { stdio: 'inherit', ...opts })
}

// ---------------------------------------------------------------------------
// Restore-only modes: node setup.js --web | --desktop
// ---------------------------------------------------------------------------
const arg = process.argv[2]

if (arg === '--web') {
    console.log('=== Restoring Node binary for web mode ===')
    copyFileSync(resolve(CACHE_NODE, BINARY), resolve(RELEASE, BINARY))
    console.log('✓ Node binary restored. You can now run: pnpm dev:web')
    process.exit(0)
}

if (arg === '--desktop') {
    console.log('=== Restoring Electron binary for desktop mode ===')
    copyFileSync(resolve(CACHE_ELECTRON, BINARY), resolve(RELEASE, BINARY))
    console.log('✓ Electron binary restored. You can now run: pnpm dev:desktop')
    process.exit(0)
}

// ---------------------------------------------------------------------------
// Full setup
// ---------------------------------------------------------------------------

// 1a. Build for Node and cache
console.log('=== Step 1a: build better-sqlite3 for Node ===')
run(`${NODE_GYP} rebuild --release`, { cwd: BETTER_SQLITE3 })
mkdirSync(CACHE_NODE, { recursive: true })
copyFileSync(resolve(RELEASE, BINARY), resolve(CACHE_NODE, BINARY))

// 1b. Build for Electron and cache
console.log('\n=== Step 1b: build better-sqlite3 for Electron ===')
run(`${ELECTRON_REBUILD} -f -w better-sqlite3`, { cwd: DESKTOP })
mkdirSync(CACHE_ELECTRON, { recursive: true })
copyFileSync(resolve(RELEASE, BINARY), resolve(CACHE_ELECTRON, BINARY))

// 1c. Restore Node binary as default (web mode)
console.log('\n=== Step 1c: restoring Node binary as default ===')
copyFileSync(resolve(CACHE_NODE, BINARY), resolve(RELEASE, BINARY))

// 2. Generate Prisma client
console.log('\n=== Step 2: prisma generate ===')
run('pnpm prisma generate', { cwd: CORE_NODE })

// 3. Apply migrations
console.log('\n=== Step 3: prisma migrate deploy ===')
run('pnpm prisma migrate deploy', { cwd: CORE_NODE })

const dbPath = resolve(CORE_NODE, 'dev.db')
if (!existsSync(dbPath)) {
    console.error(`\nERROR: Expected database file not found at ${dbPath}`)
    process.exit(1)
}

console.log(`\n✓ Setup complete. Database: ${dbPath}`)
console.log('  Web mode:     pnpm dev:web')
console.log('  Desktop mode: pnpm dev:desktop')
console.log('')
console.log('  Switch runtime at any time:')
console.log('    node setup.js --web       (before pnpm dev:web)')
console.log('    node setup.js --desktop   (before pnpm dev:desktop)')
