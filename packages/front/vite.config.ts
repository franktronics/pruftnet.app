import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const workspaceRoot = resolve(__dirname, '../..')

export default defineConfig({
    test: {
        environment: 'node',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
        dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        alias: [
            {
                find: '@repo/ui/styles.css',
                replacement: resolve(workspaceRoot, 'packages/ui/src/styles/main.css'),
            },
            {
                find: '@repo/ui/hooks',
                replacement: resolve(workspaceRoot, 'packages/ui/src/hooks/index.ts'),
            },
            {
                find: /^@repo\/ui\/(atoms|molecules|organisms|templates)$/,
                replacement: `${resolve(workspaceRoot, 'packages/ui/src/atomic')}/$1/index.ts`,
            },
            {
                find: '@repo/utils',
                replacement: resolve(workspaceRoot, 'packages/utils/src/index.ts'),
            },
        ],
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        fs: {
            allow: ['..', '../..'],
        },
    },
    preview: {
        host: '127.0.0.1',
        port: 4173,
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            '@tanstack/react-router',
            'lucide-react',
            // Worker-only dependency: the packet-detail worker is loaded through
            // `new URL(..., import.meta.url)`, which the dependency scanner does not traverse.
            // Pre-optimizing avoids a late-discovery full page reload on the first packet selection.
            'flatbuffers',
        ],
        exclude: ['@repo/ui', '@repo/utils'],
    },
})
