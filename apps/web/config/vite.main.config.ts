import { defineConfig } from 'vite'

// https://vitejs.dev/config
export default defineConfig({
    envPrefix: 'MAIN_',
    build: {
        lib: {
            entry: 'electron/main.ts',
            formats: ['cjs'],
            fileName: () => 'main.cjs',
        },
        rollupOptions: {
            external: ['electron'],
            output: {
                format: 'cjs',
            },
        },
    },
})
