import { builtinModules } from 'node:module'
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'

import { defineConfig } from 'vite'

const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])

export default defineConfig({
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env.PRUFTNET_CHANNEL': JSON.stringify(process.env.PRUFTNET_CHANNEL ?? 'main'),
        'process.env.PRUFTNET_VERSION': JSON.stringify(process.env.PRUFTNET_VERSION ?? '0.2.0'),
    },
    plugins: [
        {
            name: 'copy-drizzle-migrations',
            closeBundle: () =>
                cp(resolve('../../packages/core/drizzle'), resolve('dist/drizzle'), {
                    recursive: true,
                }),
        },
    ],
    build: {
        ssr: 'src/main.ts',
        target: 'node24',
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            external: ['vite', ...nodeBuiltins],
            output: {
                entryFileNames: 'main.js',
            },
        },
    },
    ssr: {
        noExternal: true,
    },
})
