import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from 'vitest'
import { SummaryQueryWorker } from './query-worker'

test('pages disk-backed result indexes and restarts after cancelling a scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-query-worker-'))
    const path = join(root, 'capture.sqlite')
    const db = new DatabaseSync(path)
    db.exec(
        'CREATE TABLE packets (ordinal INTEGER PRIMARY KEY); INSERT INTO packets VALUES (1), (3), (7)',
    )
    db.close()
    const worker = new SummaryQueryWorker(path)
    const query = {
        key: 'all',
        sql: 'SELECT ordinal FROM packets ORDER BY ordinal',
        params: [],
        startIndex: 1,
        limit: 1,
    }
    try {
        const preview = { ...query, key: 'preview', preview: true, startIndex: 0 }
        expect(await worker.query(preview, new AbortController().signal)).toEqual({
            count: 1,
            indexing: true,
            indexes: [1],
        })
        expect(await worker.query(preview, new AbortController().signal)).toEqual({
            count: 3,
            indexing: false,
            indexes: [1],
        })
        expect(await worker.query(query, new AbortController().signal)).toEqual({
            count: 3,
            indexing: false,
            indexes: [3],
        })
        expect(
            await worker.query({ ...query, startIndex: 2 }, new AbortController().signal),
        ).toEqual({ count: 3, indexing: false, indexes: [7] })
        const controller = new AbortController()
        const pending = worker.query(
            {
                ...query,
                key: 'slow',
                sql: 'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000000) SELECT x FROM n',
            },
            controller.signal,
        )
        const rejected = expect(pending).rejects.toThrow('aborted')
        controller.abort()
        await rejected
        expect(await worker.query(query, new AbortController().signal)).toEqual({
            count: 3,
            indexing: false,
            indexes: [3],
        })
    } finally {
        await worker.close()
        await rm(root, { recursive: true, force: true })
    }
})
