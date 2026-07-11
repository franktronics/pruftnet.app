import { Schema } from 'effect'
import { describe, expect, test } from 'vitest'
import { CaptureRpcs } from './api'
import {
    CaptureId,
    CaptureSource,
    DecimalString,
    PacketSummaryBatch,
    ReadPacketSummariesRequest,
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
        expect(decode(CaptureSource, { _tag: 'Live', interfaces: ['en0', 'lo0'] })).toMatchObject({
            _tag: 'Live',
            interfaces: ['en0', 'lo0'],
        })

        for (const malformed of [
            { _tag: 'Replay', fileId: '' },
            { _tag: 'Live', interfaces: [] },
            { _tag: 'Live', interfaces: [''] },
            { _tag: 'Unknown', fileId: 'capture.pcap' },
            { fileId: 'capture.pcap' },
        ]) {
            expectRejected(CaptureSource, malformed)
        }
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
            'ReadCaptureEvents',
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
