import { MAX_RECENT_EXPORT_JOBS, type ExportJob } from '@repo/shared/capture'
import { describe, expect, test } from 'vitest'

import { normalizeExportJobs } from './application-cache'

function job(index: number, state: ExportJob['state']): ExportJob {
    return {
        exportId: index.toString(16).padStart(32, '0'),
        state,
        startedAtNs: String(index),
        finishedAtNs: state === 'running' ? null : String(index * 10),
    } as ExportJob
}

describe('normalizeExportJobs', () => {
    test('keeps every running job and only the most recently finished terminal jobs', () => {
        const running = [job(100, 'running'), job(101, 'running')]
        const terminal = Array.from({ length: MAX_RECENT_EXPORT_JOBS + 3 }, (_, index) =>
            job(index + 1, 'completed'),
        )

        const normalized = normalizeExportJobs([...terminal, ...running])

        expect(normalized.filter((item) => item.state === 'running')).toHaveLength(2)
        expect(normalized.filter((item) => item.state !== 'running')).toHaveLength(
            MAX_RECENT_EXPORT_JOBS,
        )
        expect(normalized.some((item) => item.exportId === job(1, 'completed').exportId)).toBe(
            false,
        )
    })
})
