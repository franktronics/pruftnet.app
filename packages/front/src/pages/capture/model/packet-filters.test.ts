import { describe, expect, it } from 'vitest'
import type { PacketSummary } from '@repo/shared/capture'

import type { SummaryRow } from '#front/pages/capture/hooks/use-packet-summaries'
import {
    emptyPacketDisplayFilters,
    filterPacketRows,
    toPacketSummaryFilter,
    validatePacketDisplayFilters,
} from './packet-filters'

function packet(overrides: Partial<PacketSummary> = {}): SummaryRow {
    const summary = {
        timestampNs: '1000000000',
        interfaceId: 0,
        wireLength: 64,
        parseCondition: 'complete',
        protocolPath: [1],
        columns: [
            { key: 'source', value: '10.0.0.1' },
            { key: 'destination', value: '10.0.0.2' },
            { key: 'protocol', value: 'TCP' },
            { key: 'length', value: '64' },
            { key: 'info', value: '443 → 50000' },
        ],
        ...overrides,
    } as unknown as PacketSummary
    return { kind: 'packet', summary }
}

describe('filterPacketRows', () => {
    const rows = [
        packet({ timestampNs: '1000000000', interfaceId: 0, wireLength: 64 }),
        packet({
            timestampNs: '2500000000',
            interfaceId: 1,
            wireLength: 512,
            parseCondition: 'partial',
            protocolPath: [2],
            columns: [
                { key: 'source', value: '192.168.1.10' },
                { key: 'destination', value: '10.0.0.2' },
                { key: 'protocol', value: 'UDP' },
                { key: 'length', value: '512' },
                { key: 'info', value: 'DNS query' },
            ],
        }),
        { kind: 'gap', beforeCursor: null } as const,
    ]

    it('combines filters with AND and preserves gap rows', () => {
        const filtered = filterPacketRows(
            rows,
            {
                ...emptyPacketDisplayFilters,
                protocolIds: [2],
                interfaceIds: [1],
                minLength: '500',
                source: '192.168',
                parseConditions: ['partial'],
            },
            '1000000000',
        )
        expect(filtered).toHaveLength(2)
        expect(filtered[0]?.kind).toBe('packet')
        expect(filtered[1]?.kind).toBe('gap')
    })

    it('uses inclusive relative time bounds with decimal precision', () => {
        const filtered = filterPacketRows(
            rows,
            {
                ...emptyPacketDisplayFilters,
                timeRange: { minSeconds: '0.5', maxSeconds: '1.5' },
            },
            '1000000000',
        )
        expect(filtered.filter((row) => row.kind === 'packet')).toHaveLength(1)
        expect(filtered[0]?.kind === 'packet' && filtered[0].summary.wireLength).toBe(512)
    })

    it('matches any selected protocol and rejects invalid bounds', () => {
        expect(
            filterPacketRows(rows, { ...emptyPacketDisplayFilters, protocolIds: [1, 2] }),
        ).toHaveLength(3)
        expect(
            filterPacketRows(rows, {
                ...emptyPacketDisplayFilters,
                timeRange: { minSeconds: '2', maxSeconds: '1' },
            }),
        ).toHaveLength(1)
    })

    it('matches free text and endpoint filters case-insensitively', () => {
        const filtered = filterPacketRows(rows, {
            ...emptyPacketDisplayFilters,
            search: 'dns',
            destination: '10.0.0.2',
            maxLength: '512',
            parseConditions: ['partial'],
        })
        expect(filtered.filter((row) => row.kind === 'packet')).toHaveLength(1)
    })
})

describe('validatePacketDisplayFilters', () => {
    it('rejects malformed time and length values', () => {
        expect(
            validatePacketDisplayFilters({
                ...emptyPacketDisplayFilters,
                timeRange: { minSeconds: '1.1234567', maxSeconds: '2' },
            }),
        ).toBeTruthy()
        expect(
            validatePacketDisplayFilters({
                ...emptyPacketDisplayFilters,
                minLength: 'abc',
            }),
        ).toBeTruthy()
    })
})

describe('toPacketSummaryFilter', () => {
    it('omits the server filter when every packet is selected', () => {
        expect(toPacketSummaryFilter(emptyPacketDisplayFilters)).toBeNull()
    })

    it('normalizes a complete historical filter for a stable query key', () => {
        expect(
            toPacketSummaryFilter({
                ...emptyPacketDisplayFilters,
                search: '  DNS ',
                timeRange: { minSeconds: '0.5', maxSeconds: '2' },
                protocolIds: [2, 1, 2],
                interfaceIds: [1, 0, 1],
                minLength: '64',
                maxLength: '512',
                parseConditions: ['partial'],
                source: ' HOST ',
                destination: ' Peer ',
            }),
        ).toMatchObject({
            search: 'dns',
            minRelativeTimestampNs: '500000000',
            maxRelativeTimestampNs: '2000000000',
            protocolIds: [1, 2],
            interfaceIds: [0, 1],
            minWireLength: 64,
            maxWireLength: 512,
            parseConditions: ['partial'],
            source: 'host',
            destination: 'peer',
        })
    })
})
