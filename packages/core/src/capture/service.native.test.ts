import { existsSync } from 'node:fs'
import { mkdtemp, realpath, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
        const spoolDirectory = await realpath(
            await mkdtemp(resolve(tmpdir(), 'pruftnet-stored-detail-')),
        )
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
                let session = yield* capture.startReplay('fixture', {
                    captureId: '00000000000000000000000000000001',
                    spoolDirectory,
                })
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
        const indexes = (await readdir(spoolDirectory)).filter((name) => name.endsWith('.pidx'))
        expect(indexes.length).toBeGreaterThan(0)
        const first = result.summaries.summaries[0]!
        const storedDetail = await Effect.runPromise(
            Effect.gen(function* () {
                const capture = yield* Capture
                const indexed = yield* capture.storedDetail(
                    result.session.captureId,
                    spoolDirectory,
                    first.key.packetId,
                    result.session.registryRevision,
                    first.analysisRevision,
                )
                yield* Effect.promise(() =>
                    Promise.all(indexes.map((name) => rm(resolve(spoolDirectory, name)))),
                )
                const rebuilt = yield* capture.storedDetail(
                    result.session.captureId,
                    spoolDirectory,
                    first.key.packetId,
                    result.session.registryRevision,
                    first.analysisRevision,
                )
                expect(rebuilt).toEqual(indexed)
                return rebuilt
            }).pipe(Effect.provide(layer), Effect.scoped),
        ).finally(() => rm(spoolDirectory, { recursive: true, force: true }))

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
        expect(storedDetail).toEqual(result.detail)
        expect(result.stats.packetsAnalyzed).toBe('10')
    },
)
