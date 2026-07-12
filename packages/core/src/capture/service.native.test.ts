import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { Effect, Layer } from 'effect'
import { expect, test } from 'vitest'

import { ReplayWorker } from './replay-worker'
import { Capture } from './service'

const workerPath = resolve(process.cwd(), 'cpp/build/pruftnet_capture_worker')
const fixturePath = resolve(process.cwd(), 'cpp/tests/fixtures/ethernet_ipv4_tcp_udp.pcap')

test.runIf(existsSync(workerPath))(
    'replays packets through the native worker boundary',
    async () => {
        const layer = Capture.layer.pipe(
            Layer.provide(
                ReplayWorker.layer({
                    executablePath: workerPath,
                    replayFiles: { fixture: fixturePath },
                }),
            ),
        )
        const result = await Effect.runPromise(
            Effect.gen(function* () {
                const capture = yield* Capture
                let session = yield* capture.startReplay('fixture')
                for (let attempt = 0; attempt < 100 && session.state === 'running'; attempt += 1) {
                    yield* Effect.sleep('5 millis')
                    session = yield* capture.session(session.captureId)
                }
                const summaries = yield* capture.summaries(session.captureId, undefined, 100)
                const first = summaries.summaries[0]
                if (!first) return yield* Effect.die('Replay did not produce a packet summary')
                const detail = yield* capture.detail(session.captureId, first.key.packetId)
                const stats = yield* capture.stats(session.captureId)
                return { session, summaries, detail, stats }
            }).pipe(Effect.provide(layer), Effect.scoped),
        )

        expect(result.session.state).toBe('completed')
        expect(result.summaries.summaries).toHaveLength(10)
        expect(result.summaries.summaries[0]?.columns).toEqual([
            { key: 'source', value: '192.0.2.10' },
            { key: 'destination', value: '198.51.100.20' },
            { key: 'protocol', value: 'UDP' },
            { key: 'length', value: '60' },
            expect.objectContaining({ key: 'info' }),
        ])
        expect(new TextDecoder().decode(result.detail.slice(4, 8))).toBe('PRT2')
        expect(result.stats.packetsParsed).toBe('10')
    },
)
