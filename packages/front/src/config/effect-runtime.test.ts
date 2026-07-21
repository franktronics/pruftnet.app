import type { ApplicationChange } from '@repo/shared/realtime'
import { afterAll, describe, expect, test, vi } from 'vitest'

import { callRpc, disposeRpcRuntime, subscribeRpcStream } from './effect-runtime'

const encoder = new TextEncoder()
const instanceId = '00000000000000000000000000000001'
let applicationStreamStarted!: () => void
const applicationStreamReady = new Promise<void>((resolve) => {
    applicationStreamStarted = resolve
})

vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const frame = JSON.parse((await request.text()).trim()) as {
        readonly id: string
        readonly tag: string
    }

    if (frame.tag === 'WatchApplicationChanges') {
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        `${JSON.stringify({
                            _tag: 'Chunk',
                            requestId: frame.id,
                            values: [
                                {
                                    _tag: 'ApplicationStreamReady',
                                    instanceId,
                                    sequence: '0',
                                },
                            ],
                        })}\n`,
                    ),
                )
                applicationStreamStarted()
            },
        })
        return new Response(body, {
            headers: { 'content-type': 'application/ndjson' },
        })
    }

    if (frame.tag === 'ListCaptureInterfaces' || frame.tag === 'ListCaptures') {
        const value =
            frame.tag === 'ListCaptureInterfaces'
                ? [
                      {
                          name: 'en0',
                          description: 'Ethernet',
                          addresses: [],
                          isLoopback: false,
                          isUp: true,
                          isRunning: true,
                          isWireless: false,
                      },
                  ]
                : { captures: [] }
        return new Response(
            `${JSON.stringify({
                _tag: 'Exit',
                requestId: frame.id,
                exit: {
                    _tag: 'Success',
                    value,
                },
            })}\n`,
            { headers: { 'content-type': 'application/ndjson' } },
        )
    }

    throw new Error(`Unexpected RPC: ${frame.tag}`)
})

afterAll(async () => {
    await disposeRpcRuntime()
    vi.unstubAllGlobals()
})

describe('effect RPC runtime', () => {
    test('keeps finite calls responsive while an RPC stream is open', async () => {
        const changes: ApplicationChange[] = []
        const unsubscribe = subscribeRpcStream<ApplicationChange>({
            stream: (client) => client.WatchApplicationChanges(),
            onValue: (change) => changes.push(change),
        })

        await applicationStreamReady

        const [interfaces, captures] = await Promise.all([
            callRpc((client) => client.ListCaptureInterfaces()),
            callRpc((client) => client.ListCaptures()),
        ])

        expect(interfaces.map(({ name }) => name)).toEqual(['en0'])
        expect(captures.captures).toEqual([])
        await vi.waitFor(() => expect(changes).toHaveLength(1))

        unsubscribe()
    })
})
