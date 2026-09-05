import type { PacketSummary } from '@repo/shared/capture'

/** A bounded cache of already persisted batches. Missing cursors always fall back to storage. */
export class SummaryDeliveryCache {
    private pages: { captureId: string; rows: readonly PacketSummary[]; bytes: number }[] = []
    private bytes = 0

    append(captureId: string, rows: readonly PacketSummary[]) {
        if (rows.length === 0) return
        const bytes = rows.reduce(
            (total, row) =>
                total +
                256 +
                row.protocolPath.length * 8 +
                row.columns.reduce(
                    (size, column) => size + 64 + (column.key.length + column.value.length) * 2,
                    0,
                ),
            0,
        )
        this.pages.push({ captureId, rows, bytes })
        this.bytes += bytes
        while (this.pages.length > 32 || this.bytes > 8 * 1024 * 1024) {
            this.bytes -= this.pages.shift()!.bytes
        }
    }

    read(
        captureId: string,
        afterCursor: string | undefined,
        limit: number,
    ): readonly PacketSummary[] | undefined {
        if (afterCursor === undefined) return undefined
        const cursor = BigInt(afterCursor)
        const first = this.pages.find((page) => page.captureId === captureId)
        if (!first || BigInt(first.rows[0]!.cursor) > cursor + 1n) return undefined
        const rows: PacketSummary[] = []
        for (const page of this.pages) {
            if (page.captureId !== captureId || BigInt(page.rows.at(-1)!.cursor) <= cursor) continue
            for (const row of page.rows) {
                if (BigInt(row.cursor) <= cursor) continue
                rows.push(row)
                if (rows.length === limit) return rows
            }
        }
        return rows
    }
}
