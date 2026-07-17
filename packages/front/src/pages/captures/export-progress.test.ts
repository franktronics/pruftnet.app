import { ExportJob } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import {
    aggregateExportProgressPercent,
    exportProgressLabel,
    exportProgressPercent,
} from './export-progress'

function exportJob(overrides: Partial<ConstructorParameters<typeof ExportJob>[0]> = {}) {
    return new ExportJob({
        exportId: 'b'.repeat(32),
        captureId: 'a'.repeat(32),
        captureStartedAtNs: '1',
        format: 'pcapng',
        destinationKind: 'desktop',
        destinationLabel: '/tmp/capture.pcapng',
        state: 'running',
        phase: 'encoding',
        packetsTotal: '100',
        packetsWritten: '50',
        bytesWritten: '1024',
        estimatedBytes: '2048',
        retainedPortionOnly: null,
        checksumSha256: null,
        finalSize: null,
        downloadPath: null,
        failure: null,
        startedAtNs: '2',
        finishedAtNs: null,
        ...overrides,
    })
}

describe('export progress presentation', () => {
    test('computes packet progress without losing UInt64 precision', () => {
        const progress = exportJob({
            packetsTotal: '18446744073709551614',
            packetsWritten: '9223372036854775807',
        })

        expect(exportProgressPercent(progress)).toBe(50)
        expect(exportProgressLabel(progress)).toBe('Writing packets')
    })

    test('shows terminal preparation phases as complete', () => {
        const progress = exportJob({
            phase: 'delivering',
            packetsTotal: '0',
            packetsWritten: '0',
            bytesWritten: '0',
        })

        expect(exportProgressPercent(progress)).toBe(100)
        expect(exportProgressLabel(progress)).toBe('Saving export')
    })

    test('weights total titlebar progress by estimated export size', () => {
        expect(
            aggregateExportProgressPercent([
                exportJob({
                    exportId: 'b'.repeat(32),
                    packetsWritten: '100',
                    estimatedBytes: '100',
                }),
                exportJob({
                    exportId: 'c'.repeat(32),
                    packetsWritten: '0',
                    estimatedBytes: '900',
                }),
            ]),
        ).toBe(10)
    })
})
