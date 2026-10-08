import { net, protocol } from 'electron'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getRendererDirectoryName } from './runtime-config'

const rendererScheme = 'pruftnet'

/** Origin of the packaged renderer, also accepted by the desktop RPC server. */
export const rendererOrigin = `${rendererScheme}://app`

export const rendererEntryUrl = `${rendererOrigin}/index.html`

/**
 * Chromium keeps no V8 code cache for file:// scripts, so the packaged renderer is served from a
 * standard scheme with code caching instead. Must run before the app is ready.
 */
export function registerRendererScheme() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: rendererScheme,
            privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
        },
    ])
}

const rendererDirectory = join(
    dirname(fileURLToPath(import.meta.url)),
    `../renderer/${getRendererDirectoryName()}`,
)

export function serveRenderer() {
    protocol.handle(rendererScheme, (request) => {
        const url = new URL(request.url)
        const path = join(rendererDirectory, decodeURIComponent(url.pathname))
        const child = relative(rendererDirectory, path)
        if (url.host !== 'app' || child.startsWith('..') || isAbsolute(child)) {
            return new Response('Not found', { status: 404 })
        }
        return net.fetch(pathToFileURL(path).toString())
    })
}
