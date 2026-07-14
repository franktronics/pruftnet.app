import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { Cause, Effect, Option } from 'effect'

import { ExportJobRepository } from './export-repository'

const routePattern = /^\/exports\/([0-9a-f]{32})\/download$/

function sendJson(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
}

function parseRange(value: string | undefined, size: number) {
    if (!value) return { start: 0, end: size - 1, partial: false }
    const match = /^bytes=(\d*)-(\d*)$/.exec(value)
    if (!match || size === 0) return undefined
    if (match[1] === '' && match[2] === '') return undefined
    let start: number
    let end: number
    if (match[1] === '') {
        const suffix = Number(match[2])
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return undefined
        start = Math.max(0, size - suffix)
        end = size - 1
    } else {
        start = Number(match[1])
        end = match[2] === '' ? size - 1 : Number(match[2])
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return undefined
    }
    if (start < 0 || end < start || start >= size) return undefined
    return { start, end: Math.min(end, size - 1), partial: true }
}

export const makeExportDownloadNodeHandler = Effect.gen(function* () {
    const repository = yield* ExportJobRepository

    return (request: IncomingMessage, response: ServerResponse): void => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.setHeader('allow', 'GET, HEAD')
            sendJson(response, 405, { error: 'MethodNotAllowed' })
            return
        }
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
        const match = routePattern.exec(url.pathname)
        if (!match) {
            sendJson(response, 404, { error: 'NotFound' })
            return
        }
        const exportId = match[1]!
        void Effect.runPromiseExit(
            Effect.gen(function* () {
                const job = yield* repository.get(exportId)
                const paths = yield* repository.paths(exportId)
                if (
                    job.destinationKind !== 'server' ||
                    job.state !== 'completed' ||
                    !job.artifactAvailable ||
                    !paths.artifactPath ||
                    !job.finalSize ||
                    !job.checksumSha256
                ) {
                    return yield* Effect.fail('unavailable' as const)
                }
                const file = yield* Effect.tryPromise({
                    try: () => stat(paths.artifactPath!),
                    catch: () => 'unavailable' as const,
                })
                if (BigInt(file.size) !== BigInt(job.finalSize)) {
                    return yield* Effect.fail('corrupt' as const)
                }
                return { job, path: paths.artifactPath, size: file.size }
            }),
        ).then((exit) => {
            if (response.destroyed) return
            if (exit._tag === 'Failure') {
                const failure = Cause.failureOption(exit.cause)
                sendJson(
                    response,
                    Option.isSome(failure) && failure.value === 'corrupt' ? 409 : 404,
                    {
                        error:
                            Option.isSome(failure) && failure.value === 'corrupt'
                                ? 'ExportArtifactCorrupt'
                                : 'ExportArtifactUnavailable',
                    },
                )
                return
            }
            const range = parseRange(request.headers.range, exit.value.size)
            if (!range) {
                response.writeHead(416, {
                    'accept-ranges': 'bytes',
                    'content-range': `bytes */${exit.value.size}`,
                })
                response.end()
                return
            }
            const length = range.end - range.start + 1
            const contentType =
                exit.value.job.format === 'pcapng'
                    ? 'application/vnd.tcpdump.pcapng'
                    : 'application/vnd.tcpdump.pcap'
            const headers = {
                'accept-ranges': 'bytes',
                'cache-control': 'private, no-store',
                'content-disposition': `attachment; filename="capture-${exit.value.job.captureId}.${exit.value.job.format}"`,
                'content-length': String(length),
                'content-type': contentType,
                etag: `"sha256-${exit.value.job.checksumSha256}"`,
                'x-checksum-sha256': exit.value.job.checksumSha256!,
                ...(range.partial
                    ? { 'content-range': `bytes ${range.start}-${range.end}/${exit.value.size}` }
                    : {}),
            }
            response.writeHead(range.partial ? 206 : 200, headers)
            if (request.method === 'HEAD') {
                response.end()
                return
            }
            const stream = createReadStream(exit.value.path!, {
                start: range.start,
                end: range.end,
            })
            const close = () => stream.destroy()
            request.once('aborted', close)
            response.once('close', close)
            stream.once('error', () => response.destroy())
            stream.pipe(response)
        })
    }
})
