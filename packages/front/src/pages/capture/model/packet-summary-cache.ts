import type { PacketSummaryRange } from '@repo/shared/capture'

const MEBIBYTE = 1024 * 1024
const RANGE_OVERHEAD_BYTES = 256
const SUMMARY_OVERHEAD_BYTES = 192
const ARRAY_ENTRY_OVERHEAD_BYTES = 16
const COLUMN_OVERHEAD_BYTES = 48
const rangeEstimates = new WeakMap<object, number>()

interface CacheEntry {
    readonly id: string
    readonly datasetKey: string
    readonly remove: () => void
    readonly hasData: () => boolean
    bytes: number
    lastAccess: number
}

export interface PacketSummaryCacheStats {
    readonly budgetBytes: number
    readonly retainedBytes: number
    readonly retainedPages: number
    readonly retainedDatasets: number
    readonly evictions: number
}

export interface RegisterPacketSummaryPage {
    readonly id: string
    readonly datasetKey: string
    readonly bytes: number
    readonly remove: () => void
    readonly hasData: () => boolean
}

function stringBytes(value: string | null | undefined) {
    return value ? value.length * 2 : 0
}

export function estimatePacketSummaryRangeBytes(range: PacketSummaryRange): number {
    const cached = rangeEstimates.get(range)
    if (cached !== undefined) return cached
    let bytes = RANGE_OVERHEAD_BYTES

    for (const summary of range.summaries) {
        bytes +=
            SUMMARY_OVERHEAD_BYTES +
            stringBytes(summary.cursor) +
            stringBytes(summary.key.captureId) +
            stringBytes(summary.key.packetId) +
            stringBytes(summary.timestampNs) +
            stringBytes(summary.analysisRevision) +
            summary.protocolPath.length * (8 + ARRAY_ENTRY_OVERHEAD_BYTES)

        for (const column of summary.columns) {
            bytes +=
                COLUMN_OVERHEAD_BYTES +
                ARRAY_ENTRY_OVERHEAD_BYTES +
                stringBytes(column.key) +
                stringBytes(column.value)
        }
    }

    rangeEstimates.set(range, bytes)
    return bytes
}

export function packetSummaryCacheBytes(mebibytes: number) {
    return Math.max(1, Math.round(mebibytes * MEBIBYTE))
}

export class PacketSummaryPageCache {
    readonly #entries = new Map<string, CacheEntry>()
    readonly #ownerPins = new Map<string, Set<string>>()
    readonly #pinCounts = new Map<string, number>()
    readonly #listeners = new Set<() => void>()
    #budgetBytes: number
    #retainedBytes = 0
    #clock = 0
    #evictions = 0
    #snapshot: PacketSummaryCacheStats

    constructor(budgetBytes: number) {
        this.#budgetBytes = budgetBytes
        this.#snapshot = this.#makeSnapshot()
    }

    subscribe = (listener: () => void) => {
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }

    getSnapshot = () => this.#snapshot

    setBudgetBytes(budgetBytes: number) {
        const next = Math.max(1, Math.round(budgetBytes))
        if (next === this.#budgetBytes) return
        this.#budgetBytes = next
        this.#evict()
        this.#publish()
    }

    register(page: RegisterPacketSummaryPage) {
        const previous = this.#entries.get(page.id)
        if (previous) {
            this.#retainedBytes -= previous.bytes
            previous.bytes = page.bytes
            previous.lastAccess = ++this.#clock
            this.#retainedBytes += previous.bytes
        } else {
            this.#entries.set(page.id, {
                ...page,
                lastAccess: ++this.#clock,
            })
            this.#retainedBytes += page.bytes
        }
        this.#evict()
        this.#publish()
    }

    touch(id: string) {
        const entry = this.#entries.get(id)
        if (entry) entry.lastAccess = ++this.#clock
    }

    setPinned(ownerId: string, ids: ReadonlySet<string>) {
        const previous = this.#ownerPins.get(ownerId) ?? new Set<string>()
        for (const id of previous) {
            if (ids.has(id)) continue
            const count = (this.#pinCounts.get(id) ?? 1) - 1
            if (count <= 0) this.#pinCounts.delete(id)
            else this.#pinCounts.set(id, count)
        }
        for (const id of ids) {
            if (previous.has(id)) continue
            this.#pinCounts.set(id, (this.#pinCounts.get(id) ?? 0) + 1)
        }
        this.#ownerPins.set(ownerId, new Set(ids))
        this.#evict()
        this.#publish()
    }

    releasePins(ownerId: string) {
        const previous = this.#ownerPins.get(ownerId)
        if (!previous) return
        this.#ownerPins.delete(ownerId)
        for (const id of previous) {
            const count = (this.#pinCounts.get(id) ?? 1) - 1
            if (count <= 0) this.#pinCounts.delete(id)
            else this.#pinCounts.set(id, count)
        }
        this.#evict()
        this.#publish()
    }

    reconcile() {
        let changed = false
        for (const [id, entry] of this.#entries) {
            if (entry.hasData()) continue
            this.#entries.delete(id)
            this.#retainedBytes -= entry.bytes
            changed = true
        }
        if (changed) this.#publish()
    }

    #evict() {
        this.reconcile()
        if (this.#retainedBytes <= this.#budgetBytes) return

        const candidates = [...this.#entries.values()]
            .filter((entry) => (this.#pinCounts.get(entry.id) ?? 0) === 0)
            .sort((left, right) => left.lastAccess - right.lastAccess)

        for (const entry of candidates) {
            if (this.#retainedBytes <= this.#budgetBytes) break
            this.#entries.delete(entry.id)
            this.#retainedBytes -= entry.bytes
            this.#evictions++
            entry.remove()
        }
    }

    #makeSnapshot(): PacketSummaryCacheStats {
        return {
            budgetBytes: this.#budgetBytes,
            retainedBytes: this.#retainedBytes,
            retainedPages: this.#entries.size,
            retainedDatasets: new Set([...this.#entries.values()].map((entry) => entry.datasetKey))
                .size,
            evictions: this.#evictions,
        }
    }

    #publish() {
        this.#snapshot = this.#makeSnapshot()
        for (const listener of this.#listeners) listener()
    }
}

export const packetSummaryPageCache = new PacketSummaryPageCache(packetSummaryCacheBytes(128))
