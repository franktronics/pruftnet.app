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
        },
    },
})
