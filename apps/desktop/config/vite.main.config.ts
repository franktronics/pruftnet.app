import { defineConfig } from 'vite'
import path from 'node:path'
import { builtinModules } from 'node:module'

const coreNodeRoot = path.resolve(__dirname, '../../../packages/core-node')
const coreCppRoot = path.resolve(__dirname, '../../../packages/core-cpp')

// Externalize all Node.js built-in modules (with and without node: prefix)
const nodeBuiltins = builtinModules.flatMap((mod) => [mod, `node:${mod}`])

// https://vitejs.dev/config
export default defineConfig({
    envPrefix: 'MAIN_',
    define: {
        'process.env.DATABASE_URL': JSON.stringify(`file:${path.join(coreNodeRoot, 'dev.db')}`),
        'process.env.CORE_NODE_ROOT': JSON.stringify(coreNodeRoot),
        'process.env.CORE_CPP_ROOT': JSON.stringify(coreCppRoot),
    },
    build: {
        lib: {
            entry: 'src/main.ts',
            formats: ['es'],
            fileName: 'main',
        },
        outDir: '.vite/build',
        rollupOptions: {
            output: {
                entryFileNames: 'main.js',
            },
            external: [
                'electron',
                ...nodeBuiltins,
                /\.node$/,
                'better-sqlite3',
                'bindings',
                'file-uri-to-path',
            ],
        },
        minify: false,
    },
    resolve: {
        preserveSymlinks: true,
    },
    optimizeDeps: {
        exclude: ['@repo/core-node', '@repo/utils', '@repo/core-cpp'],
    },
    server: {
        watch: {
            ignored: ['!**/node_modules/**', '!**/packages/**'],
            usePolling: false,
        },
        fs: {
            allow: ['..', '../..', '../../..'],
        },
    },
})
