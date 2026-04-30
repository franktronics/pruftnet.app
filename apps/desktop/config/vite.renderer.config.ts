import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config
export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        watch: {
            ignored: ['!**/node_modules/**', '!**/packages/**'],
            usePolling: false,
        },
        fs: {
            allow: ['..', '../..', '../../..'],
        },
    },
    optimizeDeps: {
        exclude: ['@repo/front', '@repo/ui', '@repo/utils', '@repo/core-node'],
        include: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'use-sync-external-store/shim',
            'use-sync-external-store/shim/index.js',
            'use-sync-external-store/shim/with-selector',
            'use-sync-external-store/shim/with-selector.js',
            'scheduler',
            // recharts uses es-toolkit/compat/* which are CJS files; pre-bundling
            // converts them to ESM so Vite does not serve raw CJS to the browser.
            'recharts',
            'es-toolkit/compat',
        ],
        entries: ['src/renderer.tsx'],
        force: false,
    },
    resolve: {
        preserveSymlinks: true,
    },
})
