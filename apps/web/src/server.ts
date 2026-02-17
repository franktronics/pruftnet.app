import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { trpcServer } from '@repo/utils'
import { appRouter, appWsRouter } from '@repo/core-node'
import { WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isProd = process.env.NODE_ENV === 'production'
const PORT = process.env.PORT ? Number(process.env.PORT) : 3010
const HOST = process.env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0')

const app = express()

app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.status(200).send('ok'))

app.all('/trpc/:procedure', trpcServer.createExpressMiddleware(appRouter))

if (!isProd) {
    // Dev: use Vite in middleware mode for HMR and assets
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
        configFile: path.resolve(process.cwd(), 'vite.config.ts'),
        server: { middlewareMode: true },
    })

    app.use(vite.middlewares)

    // SPA fallback to index.html handled via Vite template transform
    app.use(async (req, res, next) => {
        if (req.method !== 'GET') return next()
        if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/healthz'))
            return next()
        try {
            const url = req.originalUrl
            const indexPath = path.resolve(__dirname, 'index.html')
            let template = await fs.readFile(indexPath, 'utf-8')
            template = await vite.transformIndexHtml(url, template)
            res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
        } catch (e: any) {
            vite.ssrFixStacktrace(e)
            next(e)
        }
    })
} else {
    // Prod: serve pre-built static assets
    const clientDist = path.resolve(process.cwd(), 'dist/client')

    app.use(express.static(clientDist))

    // SPA fallback to built index.html
    app.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/healthz'))
            return next()
        res.sendFile(path.join(clientDist, 'index.html'))
    })
}

const server = app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT} (${isProd ? 'prod' : 'dev'})`)
})

const wss = new WebSocketServer({ server })
wss.on('connection', trpcServer.createWSSMiddleware(appWsRouter))
