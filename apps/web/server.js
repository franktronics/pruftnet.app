import fs from 'node:fs/promises'
import express from 'express'

const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.MAIN_SERVER_PORT || 5173
const base = process.env.BASE || '/'

const app = express()

if (!isProduction) {
    // Dev mode - use Vite's middleware
    const { createServer } = await import('vite')
    const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa', // Single Page Application
        base,
    })
    app.use(vite.middlewares)
} else {
    // Production mode - serve pre-built files
    const compression = (await import('compression')).default
    const sirv = (await import('sirv')).default
    app.use(compression())
    app.use(base, sirv('./dist/client', { extensions: [] }))

    app.get('*', async (req, res) => {
        const html = await fs.readFile('./dist/client/index.html', 'utf-8')
        res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
    })
}

app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`)
})
