import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'
import { CaptureRpcs } from './api'
import {
    CaptureId,
    CaptureSource,
    DecimalString,
    PacketSummaryBatch,
    PacketSummaryColumn,
    ReplayCaptureSource,
    ReadPacketSummariesRequest,
    StartCaptureRequest,
} from './schema'

const captureId = '0123456789abcdef0123456789abcdef'
const precisionSafeDecimal = '18446744073709551615'

const decode = <A, I>(schema: Schema.Schema<A, I, never>, input: unknown): A =>
    Schema.decodeUnknownSync(schema)(input)

const expectRejected = <A, I>(schema: Schema.Schema<A, I, never>, input: unknown): void => {
    expect(() => decode(schema, input)).toThrow()
}

describe('capture schemas', () => {
    test('preserves precision-sensitive integers as decimal strings', () => {
        expect(decode(DecimalString, precisionSafeDecimal)).toBe(precisionSafeDecimal)

        for (const malformed of ['', '-1', '+1', '01', '1.0', 18446744073709551615n]) {
            expectRejected(DecimalString, malformed)
        }
    })

    test('accepts only canonical capture IDs', () => {
        expect(decode(CaptureId, captureId)).toBe(captureId)

        for (const malformed of [
            captureId.slice(1),
            `${captureId}0`,
            captureId.toUpperCase(),
            'g'.repeat(32),
        ]) {
            expectRejected(CaptureId, malformed)
        }
    })

    test('decodes tagged replay and live capture sources', () => {
        expect(decode(CaptureSource, { _tag: 'Replay', fileId: 'capture.pcap' })).toMatchObject({
            _tag: 'Replay',
            fileId: 'capture.pcap',
        })
        const live = {
            _tag: 'Live',
            interfaces: [
                {
                    name: 'en0',
                    promiscuous: true,
                    monitorMode: false,
                    linkType: null,
                    timestampType: null,
                },
            ],
            bpfFilter: 'tcp',
            snaplen: 65_535,
            pcapBufferSizeBytes: 8 * 1024 * 1024,
            readTimeoutMs: 10,
            dispatchBatchSize: 64,
            ringSlots: 1024,
            captureQueueBytes: 16 * 1024 * 1024,
            maxTotalRingBytes: 128 * 1024 * 1024,
            spoolMaxTotalBytes: String(8 * 1024 * 1024 * 1024),
            spoolSegmentBytes: String(512 * 1024 * 1024),
            spoolMaxSegments: 16,
            spoolRingMode: false,
            spoolTemporary: true,
        }
        expect(decode(CaptureSource, live)).toMatchObject(live)

        for (const malformed of [
            { _tag: 'Replay', fileId: '' },
            { _tag: 'Live', interfaces: [] },
            { ...live, interfaces: [{ ...live.interfaces[0], name: '' }] },
            { _tag: 'Unknown', fileId: 'capture.pcap' },
            { fileId: 'capture.pcap' },
        ]) {
            expectRejected(CaptureSource, malformed)
        }
    })

    test('constructs a start request with a schema-backed replay source', () => {
        const request = new StartCaptureRequest({
            source: new ReplayCaptureSource({ fileId: 'demo' }),
        })

        expect(request.source).toMatchObject({ _tag: 'Replay', fileId: 'demo' })
    })

    test('enforces packet summary batch request limits', () => {
        for (const limit of [1, 1024]) {
            expect(decode(ReadPacketSummariesRequest, { captureId, limit })).toMatchObject({
                captureId,
                limit,
            })
        }

        for (const limit of [0, 1025, 1.5, '10']) {
            expectRejected(ReadPacketSummariesRequest, { captureId, limit })
        }
    })

    test('bounds packet summary column values', () => {
        expect(
            decode(PacketSummaryColumn, { key: 'info', value: 'x'.repeat(256) }).value,
        ).toHaveLength(256)
        expectRejected(PacketSummaryColumn, { key: 'info', value: 'x'.repeat(257) })
    })
})

describe('capture RPC contract', () => {
    test('exposes the complete capture procedure set', () => {
        expect([...CaptureRpcs.requests.keys()]).toEqual([
            'ListCaptureInterfaces',
            'GetCaptureInterfaceCapabilities',
            'StartCapture',
            'StopCapture',
            'GetCaptureSession',
            'ReadPacketSummaries',
            'GetRegistrySnapshot',
            'GetCaptureStats',
            'ListCaptureStatSamples',
            'ReadCaptureEvents',
            'ListCaptures',
            'GetCapture',
            'GetActiveCapture',
            'OpenCapture',
            'DeleteCapture',
            'CreateExport',
            'GetExport',
            'ListExports',
            'CancelExport',
            'RetryExport',
            'DeleteExportArtifact',
        ])
    })

    test('rejects malformed payloads through attached RPC schemas', () => {
        const requests = [...CaptureRpcs.requests.values()]
        const startCapture = requests.find((request) => request._tag === 'StartCapture')
        const readPacketSummaries = requests.find(
            (request) => request._tag === 'ReadPacketSummaries',
        )
        expect(startCapture).toBeDefined()
        expect(readPacketSummaries).toBeDefined()

        expectRejected(startCapture!.payloadSchema, { source: { _tag: 'Live', interfaces: [] } })
        expectRejected(readPacketSummaries!.payloadSchema, { captureId: 'invalid', limit: 100 })
        expectRejected(readPacketSummaries!.payloadSchema, {
            captureId,
            afterCursor: Number('9007199254740993'),
            limit: 100,
        })
    })

    test('preserves decimal strings through the summary RPC response schema', () => {
        const readPacketSummaries = [...CaptureRpcs.requests.values()].find(
            (request) => request._tag === 'ReadPacketSummaries',
        )
        expect(readPacketSummaries).toBeDefined()

        const batch = {
            captureId,
            firstCursor: precisionSafeDecimal,
            lastCursor: precisionSafeDecimal,
            oldestAvailableCursor: precisionSafeDecimal,
            newestAvailableCursor: precisionSafeDecimal,
            gapBeforeFirst: false,
            captureComplete: false,
            summaries: [],
        }
        expect(decode(readPacketSummaries!.successSchema, batch)).toMatchObject(batch)
        expectRejected(PacketSummaryBatch, { ...batch, firstCursor: -1 })
    })
})
