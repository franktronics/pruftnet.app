import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { ViteDevServer } from 'vite'

import type { ServerConfig } from '../config'

export async function createViteDevServer(config: ServerConfig) {
    const { createServer } = await import('vite')

    return createServer({
        configFile: config.frontendViteConfigPath,
        root: config.frontendRootPath,
        appType: 'custom',
        server: {
            middlewareMode: true,
            hmr: {
                server: undefined,
            },
        },
    })
}

export function serveViteFrontend(vite: ViteDevServer, config: ServerConfig) {
    return (request: IncomingMessage, response: ServerResponse) => {
        vite.middlewares(request, response, async (error?: unknown) => {
            if (error) {
                if (error instanceof Error) {
                    vite.ssrFixStacktrace(error)
                }
                response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
                response.end(error instanceof Error ? error.stack : String(error))
                return
            }

            if (request.method !== 'GET') {
                response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
                response.end('Not found')
                return
            }

            try {
                const requestUrl = request.url ?? '/'
                const templatePath = join(config.frontendRootPath, 'index.html')
                const template = await readFile(templatePath, 'utf-8')
                const html = await vite.transformIndexHtml(requestUrl, template)

                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
                response.end(html)
            } catch (templateError) {
                if (templateError instanceof Error) {
                    vite.ssrFixStacktrace(templateError)
                }
                response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
                response.end(
                    templateError instanceof Error ? templateError.stack : String(templateError),
                )
            }
        })
    }
}
