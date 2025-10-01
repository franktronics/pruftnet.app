import esbuild from 'esbuild'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isProduction = process.argv.includes('--production')
const isWatch = !isProduction

// Express App
const serverConfig = {
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/server.js',
    external: ['express'],
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
}

// React App
const clientConfig = {
    entryPoints: ['src/app.tsx'],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    outfile: 'dist/public/app.js',
    jsx: 'automatic',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info',
}

function generateHTML() {
    const html = `<!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Express React App</title>
            <style>
                body { margin: 0; font-family: Arial, sans-serif; }
                #root { padding: 20px; }
            </style>
        </head>
        <body>
            <div id="root"></div>
            <script src="/app.js"></script>
        </body>
        </html>
    `
    mkdirSync('dist/public', { recursive: true })
    writeFileSync('dist/public/index.html', html)
}

async function build() {
    try {
        console.log(`🚀 Building in ${isProduction ? 'production' : 'development'} mode...`)

        generateHTML()
        console.log('✅ HTML generated')

        if (!isProduction) {
            // Mode développement avec watch
            const serverContext = await esbuild.context(serverConfig)
            const clientContext = await esbuild.context(clientConfig)

            await Promise.all([serverContext.watch(), clientContext.watch()])

            console.log('👀 Watching for changes...')
            console.log('🌐 Start your server with: node dist/server.js')
        } else {
            // Mode production - build unique
            await Promise.all([esbuild.build(serverConfig), esbuild.build(clientConfig)])

            console.log('✅ Build completed successfully!')
            console.log('🚀 Run with: npm start')
        }
    } catch (error) {
        console.error('❌ Build failed:', error)
        process.exit(1)
    }
}

build()
