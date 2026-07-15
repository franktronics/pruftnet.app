import { ExportProgress } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import { exportProgressLabel, exportProgressPercent } from './export-progress'

describe('export progress presentation', () => {
    test('computes packet progress without losing UInt64 precision', () => {
        const progress = new ExportProgress({
            captureId: 'a'.repeat(32),
            format: 'pcapng',
            phase: 'encoding',
            packetsTotal: '18446744073709551614',
            packetsWritten: '9223372036854775807',
            bytesWritten: '1024',
        })

        expect(exportProgressPercent(progress)).toBe(50)
        expect(exportProgressLabel(progress)).toBe('Writing packets')
    })

    test('shows terminal preparation phases as complete', () => {
        const progress = new ExportProgress({
            captureId: 'a'.repeat(32),
            format: 'pcapng',
            phase: 'delivering',
            packetsTotal: '0',
            packetsWritten: '0',
            bytesWritten: '0',
        })

        expect(exportProgressPercent(progress)).toBe(100)
        expect(exportProgressLabel(progress)).toBe('Saving export')
    })
})
