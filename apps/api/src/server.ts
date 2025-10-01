import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Static files
app.use(express.static(join(__dirname, 'public')))

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
    })
})

// Catch-all route to serve React app
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'))
})

// Gestion des erreurs
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Express error:', err.message)
    res.status(500).json({ error: 'Internal Server Error' })
})

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
})
