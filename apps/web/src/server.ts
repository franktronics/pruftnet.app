import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { trpc } from '@repo/utils'
import { appRouter } from '@repo/core-node'
import { WebSocketServer, type WebSocket } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isProd = process.env.NODE_ENV === 'production'
const PORT = process.env.PORT ? Number(process.env.PORT) : 3010
const HOST = process.env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0')

const app = express()
process.env.WEB = 'on'

app.use(express.json())

app.get('/health', (_req, res) => res.status(200).send('ok'))

app.all('/trpc/:procedure', trpc.createExpressMiddleware(appRouter))

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
// Test WebSocket server

function handler(ws: WebSocket, cb: (data: string) => void) {
    setInterval(() => {
        cb(JSON.stringify({ timestamp: new Date().toISOString() }))
    }, 1000)
}

const wss = new WebSocketServer({ server })
wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established')
    console.log('Request URL:', req.url)

    ws.on('message', (message) => {
        console.log('Received:', message.toString())
    })

    handler(ws, (data) => {
        ws.send(data)
    })

    ws.on('close', () => {
        console.log('WebSocket connection closed')
    })
})
