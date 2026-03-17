/**
 * Build standalone server bundle for production deployment.
 * This creates a self-contained server that can be distributed as a tarball.
 *
 * Usage: node esbuild.standalone.mjs
 *
 * Output: dist/standalone/server.js (bundled server with all dependencies except native modules)
 */

import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const outdir = 'dist/standalone'

// Get version from package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const version = pkg.version

console.log(`Building standalone server v${version}...`)

// Clean output directory
if (fs.existsSync(outdir)) {
    fs.rmSync(outdir, { recursive: true })
}
fs.mkdirSync(outdir, { recursive: true })

try {
    // Bundle the server with all JS dependencies
    await build({
        entryPoints: ['src/server.ts'],
        outfile: `${outdir}/server.js`,
        platform: 'node',
        format: 'esm',
        target: ['node20'],
        bundle: true,
        // External: native modules and build-time dependencies that cannot be bundled
        external: [
            'better-sqlite3',
            '*.node',
            // Build-time dependencies (not needed at runtime)
            'lightningcss',
            'vite',
            '@vitejs/*',
            'tailwindcss',
            'postcss',
            'esbuild',
        ],
        sourcemap: false,
        minify: true,
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        banner: {
            js: `// Pruftnet Server v${version}\n// Built: ${new Date().toISOString()}\n`,
        },
        logLevel: 'info',
    })

    console.log('Server bundle created successfully!')
} catch (err) {
    console.error('esbuild: failed to build standalone server')
    console.error(err)
    process.exit(1)
}
