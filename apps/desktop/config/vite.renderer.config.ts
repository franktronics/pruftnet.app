import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const workspaceRoot = resolve(__dirname, '../../..')

export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
        outDir: 'dist-electron/renderer/main_window',
        emptyOutDir: true,
    },
    resolve: {
        dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        alias: [
            {
                find: '@repo/front',
                replacement: resolve(workspaceRoot, 'packages/front/src/app.tsx'),
            },
            {
                find: '@repo/ui/styles.css',
                replacement: resolve(workspaceRoot, 'packages/ui/src/styles/main.css'),
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
        fs: {
            allow: ['..', '../..', '../../..'],
        },
    },
    optimizeDeps: {
        include: [
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            '@tanstack/react-router',
        ],
        exclude: ['@repo/front', '@repo/ui', '@repo/utils'],
    },
})
