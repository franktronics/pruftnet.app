import { sql } from 'drizzle-orm'
import {
    check,
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const captureStates = [
    'preparing',
    'capturing',
    'stopping',
    'stopped',
    'failed',
    'interrupted',
    'recovering',
    'deleting',
    'deleted',
] as const

export const captureSessions = sqliteTable(
    'capture_sessions',
    {
        id: text().primaryKey(),
        state: text({ enum: captureStates }).notNull(),
        sourceJson: text('source_json', { mode: 'json' }).notNull().$type<unknown>(),
        interfaceCount: integer('interface_count').notNull(),
        sourceFormat: text('source_format', { enum: ['pcapng', 'pcap'] }).notNull(),
        startedAtNs: text('started_at_ns').notNull(),
        stoppedAtNs: text('stopped_at_ns'),
        packetCount: text('packet_count').notNull().default('0'),
        retainedBytes: text('retained_bytes').notNull().default('0'),
        registryRevision: text('registry_revision').notNull().default('0'),
        summaryCursor: text('summary_cursor').notNull().default('0'),
        summaryCount: text('summary_count').notNull().default('0'),
        analysisCursor: text('analysis_cursor').notNull().default('0'),
        failureCode: text('failure_code'),
        failureMessage: text('failure_message'),
        deleteRequested: integer('delete_requested', { mode: 'boolean' }).notNull().default(false),
        createdAtNs: text('created_at_ns').notNull(),
        updatedAtNs: text('updated_at_ns').notNull(),
    },
    (table) => [
        check('capture_sessions_id', sql`length(${table.id}) = 32`),
        check('capture_sessions_interface_count', sql`${table.interfaceCount} > 0`),
        check(
            'capture_sessions_state',
            sql`${table.state} in ('preparing','capturing','stopping','stopped','failed','interrupted','recovering','deleting','deleted')`,
        ),
        check('capture_sessions_source_format', sql`${table.sourceFormat} in ('pcapng','pcap')`),
        uniqueIndex('capture_sessions_one_live')
            .on(sql`1`)
            .where(sql`${table.state} in ('preparing', 'capturing', 'stopping')`),
    ],
)

export const captureSegments = sqliteTable(
    'capture_segments',
    {
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id),
        generation: integer().notNull(),
        path: text().notNull().unique(),
        committedBytes: text('committed_bytes').notNull(),
        committedPackets: text('committed_packets').notNull(),
        firstPacketId: text('first_packet_id'),
        lastPacketId: text('last_packet_id'),
        checksumSha256: text('checksum_sha256'),
        valid: integer({ mode: 'boolean' }).notNull().default(true),
        evicted: integer({ mode: 'boolean' }).notNull().default(false),
        leaseCount: integer('lease_count').notNull().default(0),
        createdAtNs: text('created_at_ns').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.captureId, table.generation] }),
        check('capture_segments_generation', sql`${table.generation} >= 0`),
        check('capture_segments_lease_count', sql`${table.leaseCount} >= 0`),
        check(
            'capture_segments_committed_bytes',
            sql`length(${table.committedBytes}) > 0 and ${table.committedBytes} not glob '*[^0-9]*'`,
        ),
    ],
)

export const exportArtifacts = sqliteTable(
    'export_artifacts',
    {
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id),
        format: text({ enum: ['pcapng', 'pcap'] }).notNull(),
        sourceFingerprint: text('source_fingerprint').notNull(),
        artifactPath: text('artifact_path').notNull(),
        retainedPortionOnly: integer('retained_portion_only', { mode: 'boolean' })
            .notNull()
            .default(false),
        checksumSha256: text('checksum_sha256').notNull(),
        finalSize: text('final_size').notNull(),
        createdAtNs: text('created_at_ns').notNull(),
        updatedAtNs: text('updated_at_ns').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.captureId, table.format] }),
        check('export_artifacts_format', sql`${table.format} in ('pcapng','pcap')`),
    ],
)

export const captureStatSamples = sqliteTable(
    'capture_stat_samples',
    {
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id, { onDelete: 'cascade' }),
        sampledAtNs: text('sampled_at_ns').notNull(),
        statsJson: text('stats_json', { mode: 'json' }).notNull().$type<unknown>(),
    },
    (table) => [primaryKey({ columns: [table.captureId, table.sampledAtNs] })],
)

export const captureSummaries = sqliteTable(
    'capture_summaries',
    {
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id, { onDelete: 'cascade' }),
        cursor: text().notNull(),
        rowIndex: integer('row_index').notNull(),
        packetId: text('packet_id').notNull(),
        summaryJson: text('summary_json', { mode: 'json' }).notNull().$type<unknown>(),
    },
    (table) => [
        primaryKey({ columns: [table.captureId, table.cursor] }),
        index('capture_summaries_packet').on(table.captureId, table.packetId),
        uniqueIndex('capture_summaries_row').on(table.captureId, table.rowIndex),
        check('capture_summaries_row_index', sql`${table.rowIndex} >= 0`),
    ],
)

export const captureEvents = sqliteTable(
    'capture_events',
    {
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id, { onDelete: 'cascade' }),
        cursor: text().notNull(),
        eventJson: text('event_json', { mode: 'json' }).notNull().$type<unknown>(),
    },
    (table) => [primaryKey({ columns: [table.captureId, table.cursor] })],
)
