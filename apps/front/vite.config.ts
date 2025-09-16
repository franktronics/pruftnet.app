import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(() => {
    return {
        plugins: [react(), tailwindcss()],
        base: './',
        build: {
            outDir: 'dist',
        },
        server: {
            port: 5174,
            strictPort: true,
        },
        resolve: {
            alias: {
                '@': path.join(__dirname, './src'),
            },
        },
    }
})
