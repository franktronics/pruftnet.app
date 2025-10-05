import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
import { NetworkScanner, PacketData } from '@repo/core'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isProd = process.env.NODE_ENV === 'production'
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000

const app = express()
let networkScanner: NetworkScanner | null = null

// Middleware pour parser JSON
app.use(express.json())

// Simple healthcheck
app.get('/healthz', (_req, res) => res.status(200).send('ok'))

// Example API route
app.get('/api/hello', (_req, res) => {
    res.json({ message: 'Hello from ExpressJS' })
})

// Route pour démarrer le scan réseau
app.post('/api/start-scan', async (req, res) => {
    try {
        const { nic } = req.body

        if (!nic || typeof nic !== 'string') {
            return res.status(400).json({ 
                error: 'Network interface (nic) is required and must be a string' 
            })
        }

        // Arrêter le scan précédent s'il existe
        if (networkScanner) {
            console.log('Stopping previous scan...')
            networkScanner.stopScan()
        }

        // Créer nouveau scanner
        networkScanner = new NetworkScanner()

        // Callback pour traiter chaque paquet
        const packetCallback = (packet: PacketData) => {
            // Log des informations du paquet en console
            console.log('📦 New packet captured:')
            console.log(`  ├─ Length: ${packet.length} bytes`)
            console.log(`  ├─ Interface: ${packet.source_interface}`)
            console.log(`  ├─ Timestamp: ${new Date(packet.timestamp).toISOString()}`)
            console.log(`  └─ Data preview: ${Buffer.from(packet.data.slice(0, 16)).toString('hex')}...`)
        }

        // Démarrer le scan
        const success = await networkScanner.startScan(nic, packetCallback)

        if (success) {
            console.log(`🔍 Network scan started on interface: ${nic}`)
            res.json({ 
                success: true, 
                message: `Network scan started on interface: ${nic}`,
                interface: nic
            })
        } else {
            res.status(500).json({ 
                error: `Failed to start scan on interface: ${nic}` 
            })
        }

    } catch (error) {
        console.error('Error starting network scan:', error)
        res.status(500).json({ 
            error: 'Internal server error', 
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

// Route pour arrêter le scan réseau
app.post('/api/stop-scan', (req, res) => {
    try {
        if (networkScanner) {
            networkScanner.stopScan()
            
            // Afficher les statistiques finales
            const stats = networkScanner.getStats()
            console.log('📊 Final scan statistics:')
            console.log(`  ├─ Total packets: ${stats.totalPackets}`)
            console.log(`  ├─ Dropped packets: ${stats.droppedPackets}`)
            console.log(`  └─ Queue size: ${stats.queueSize}`)
            
            networkScanner = null
            
            res.json({ 
                success: true, 
                message: 'Network scan stopped',
                stats
            })
        } else {
            res.json({ 
                success: false, 
                message: 'No active scan to stop' 
            })
        }
    } catch (error) {
        console.error('Error stopping network scan:', error)
        res.status(500).json({ 
            error: 'Error stopping scan',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
})

// Route pour obtenir les statistiques du scan en cours
app.get('/api/scan-stats', (req, res) => {
    try {
        if (networkScanner) {
            const stats = networkScanner.getStats()
            res.json({
                active: true,
                stats
            })
        } else {
            res.json({
                active: false,
                stats: {
                    totalPackets: 0,
                    droppedPackets: 0,
                    queueSize: 0
                }
            })
        }
    } catch (error) {
        console.error('Error getting scan stats:', error)
        res.status(500).json({
            error: 'Error getting statistics',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
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

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT} (${isProd ? 'prod' : 'dev'})`)
})
