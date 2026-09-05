import type { IncomingMessage, ServerResponse } from 'node:http'

import {
    CaptureNotFound,
    PacketDataCorrupted,
    PacketDetailPending,
    PacketEvicted,
    PacketNotFound,
} from '@repo/shared/capture'
import { Cause, Effect, Option, Schema } from 'effect'

import { CaptureSessionManager } from './manager'

const PacketRoute = Schema.Struct({
    captureId: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/)),
    packetId: Schema.String.pipe(Schema.pattern(/^(0|[1-9][0-9]*)$/)),
})
const Revision = /^(0|[1-9][0-9]*)$/
const routePattern = /^\/capture\/([^/]+)\/packets\/([^/]+)$/

function sendJson(response: ServerResponse, status: number, body: unknown) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(body))
}

export const makePacketDetailNodeHandler = Effect.gen(function* () {
    const capture = yield* CaptureSessionManager

    return (request: IncomingMessage, response: ServerResponse): void => {
        if (request.method !== 'GET') {
            response.setHeader('allow', 'GET')
            sendJson(response, 405, { error: 'MethodNotAllowed' })
            return
        }
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
        const match = routePattern.exec(url.pathname)
        if (!match) {
            sendJson(response, 404, { error: 'NotFound' })
            return
        }
        const decoded = Schema.decodeUnknownEither(PacketRoute)({
            captureId: match[1],
            packetId: match[2],
        })
        if (decoded._tag === 'Left') {
            sendJson(response, 400, { error: 'InvalidPacketKey' })
            return
        }

        const controller = new AbortController()
        const abort = () => controller.abort()
        const close = () => {
            if (!response.writableEnded) abort()
        }
        request.once('aborted', abort)
        response.once('close', close)
        void Effect.runPromiseExit(
            capture.detail(
                decoded.right.captureId,
                decoded.right.packetId,
                url.searchParams.get('registryRevision')?.match(Revision)?.[0],
                url.searchParams.get('analysisRevision')?.match(Revision)?.[0],
            ),
            {
                signal: controller.signal,
            },
        ).then((exit) => {
            request.off('aborted', abort)
            response.off('close', close)
            if (response.destroyed) return
            if (exit._tag === 'Success') {
                response.writeHead(200, {
                    'cache-control': 'no-store',
                    'content-length': String(exit.value.byteLength),
                    'content-type': 'application/vnd.pruftnet.packet-tree',
                })
                response.end(exit.value)
                return
            }
            const failure = Cause.failureOption(exit.cause)
            if (Option.isSome(failure) && failure.value instanceof PacketEvicted) {
                sendJson(response, 410, { error: failure.value._tag })
            } else if (Option.isSome(failure) && failure.value instanceof PacketDetailPending) {
                sendJson(response, 425, { error: failure.value._tag })
            } else if (Option.isSome(failure) && failure.value instanceof PacketDataCorrupted) {
                sendJson(response, 422, { error: failure.value._tag })
            } else if (
                Option.isSome(failure) &&
                (failure.value instanceof PacketNotFound ||
                    failure.value instanceof CaptureNotFound)
            ) {
                sendJson(response, 404, { error: failure.value._tag })
            } else {
                sendJson(response, 503, { error: 'PacketDetailUnavailable' })
            }
        })
    }
})
