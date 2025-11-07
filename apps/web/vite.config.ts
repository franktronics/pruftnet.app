import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'

// Vite utilisera src/ comme racine pour index.html et les assets.
export default defineConfig({
    root: path.resolve(__dirname, 'src'),
    plugins: [react()],
    build: {
        outDir: path.resolve(__dirname, 'dist/client'),
        emptyOutDir: true,
    },
    server: {
        host: true,
        strictPort: false,
    },
})
