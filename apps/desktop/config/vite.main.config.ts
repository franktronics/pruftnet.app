import { defineConfig } from 'vite'

// https://vitejs.dev/config
export default defineConfig({
    envPrefix: 'MAIN_',
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
            external: ['electron', 'path', 'fs', 'net'],
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
