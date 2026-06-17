import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { extname, join, resolve } from "node:path"
import type { IncomingMessage, ServerResponse } from "node:http"

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
}

async function canRead(filePath: string) {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return "/"
  }
}

function resolveAssetPath(frontendDistPath: string, requestUrl: string) {
  const root = resolve(frontendDistPath)
  const url = new URL(requestUrl, "http://localhost")
  const pathname = decodePathname(url.pathname)
  const assetPath = pathname === "/" ? "/index.html" : pathname
  const candidate = resolve(root, `.${assetPath}`)

  if (candidate !== root && !candidate.startsWith(`${root}/`)) {
    return join(root, "index.html")
  }

  return candidate
}

function sendResponse(response: ServerResponse, status: number, body: string | Uint8Array, contentType: string) {
  response.writeHead(status, { "content-type": contentType })
  response.end(body)
}

async function sendFile(response: ServerResponse, filePath: string) {
  const body = await readFile(filePath)
  const contentType = contentTypes[extname(filePath)] ?? "application/octet-stream"
  sendResponse(response, 200, body, contentType)
}

export async function serveStaticFrontend(
  request: IncomingMessage,
  response: ServerResponse,
  frontendDistPath: string
) {
  const assetPath = resolveAssetPath(frontendDistPath, request.url ?? "/")

  if (await canRead(assetPath)) {
    await sendFile(response, assetPath)
    return
  }

  const indexPath = join(resolve(frontendDistPath), "index.html")

  if (await canRead(indexPath)) {
    await sendFile(response, indexPath)
    return
  }

  sendResponse(
    response,
    404,
    "Front build not found. Run `pnpm --filter @repo/front build` first.",
    "text/plain; charset=utf-8"
  )
}
