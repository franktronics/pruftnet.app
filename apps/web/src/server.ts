import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { PacketParser, NetworkSniffer, NetworkInterface } from '@repo/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isProd = process.env.NODE_ENV === 'production'
const PORT = process.env.PORT ? Number(process.env.PORT) : 3010
const HOST = process.env.HOST || (isProd ? '127.0.0.1' : '0.0.0.0')

const app = express()
let packetParser: PacketParser | null = null

// Middleware pour parser JSON
app.use(express.json())

// Simple healthcheck
app.get('/health', (_req, res) => res.status(200).send('ok'))

// Example API route
app.get('/api/hello', (_req, res) => {
    res.json({ message: 'Hello from ExpressJS' })
})

const sniffer = new NetworkSniffer()
let count = 0
const capturedPackets: any[] = []

app.post('/api/v1/start-sniff', async (req, res) => {
    const interfaceName = req.body.nic
    const networkInterface = new NetworkInterface(interfaceName)

    if (!interfaceName) {
        return res.status(400).json({ error: 'NIC name is required' })
    }

    try {
        const started = await sniffer.startSniffing(networkInterface, (packet) => {
            if (!packetParser) {
                packetParser = new PacketParser()
            }
            console.log(`_______________________________ Packet #${++count}`)
            console.log(packet)
            console.log(`_______________________________`)
            const parsedPacket = packetParser.parse(packet.data)
            capturedPackets.push(parsedPacket)
        })
        if (started) {
            return res.json({ message: `Sniffing started on interface ${interfaceName}` })
        } else {
            return res.status(500).json({ error: 'Failed to start sniffing' })
        }
    } catch (error) {
        console.error("Sniffing catched error", error)
        return res.status(500).json({ error: 'Failed to start sniffer' })
    }
})

app.post('/api/v1/stop-sniff', (_req, res) => {
    try {
        sniffer.stopSniffing()
        return res.json({ message: 'Sniffing stopped', capturedPackets })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to stop sniffer' })
    }
})

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

app.listen(PORT, HOST, () => {
    console.log(`Server listening on http://${HOST}:${PORT} (${isProd ? 'prod' : 'dev'})`)
})
