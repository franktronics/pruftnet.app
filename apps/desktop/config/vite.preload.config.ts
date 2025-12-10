import { defineConfig } from 'vite'
import path from 'path'

// https://vitejs.dev/config
export default defineConfig({
    build: {
        rollupOptions: {
            external: ['electron'],
        },
        minify: false,
    },
    resolve: {
        preserveSymlinks: true,
    },
    optimizeDeps: {
        exclude: ['@repo/utils'],
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
