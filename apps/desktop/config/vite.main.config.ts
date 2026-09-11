import { builtinModules } from 'node:module'

import { defineConfig } from 'vite'

const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])

export default defineConfig({
    define: {
        'process.env.PRUFTNET_CHANNEL': JSON.stringify(process.env.PRUFTNET_CHANNEL ?? 'main'),
        'process.env.PRUFTNET_VERSION': JSON.stringify(process.env.PRUFTNET_VERSION ?? '0.2.0'),
    },
    build: {
        lib: {
            entry: 'src/main.ts',
            formats: ['es'],
            fileName: 'main',
        },
        outDir: 'dist-electron/main',
        rollupOptions: {
            output: {
                entryFileNames: 'main.js',
            },
            external: ['electron', ...nodeBuiltins],
        },
        minify: false,
    },
})
