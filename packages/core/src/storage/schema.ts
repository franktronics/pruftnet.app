import { sql } from 'drizzle-orm'
import {
    check,
    foreignKey,
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

const exportStates = [
    'queued',
    'preparing',
    'running',
    'finalizing',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
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

export const exportJobs = sqliteTable(
    'export_jobs',
    {
        id: text().primaryKey(),
        captureId: text('capture_id')
            .notNull()
            .references(() => captureSessions.id),
        idempotencyKey: text('idempotency_key').notNull().unique(),
        state: text({ enum: exportStates }).notNull(),
        format: text({ enum: ['pcapng', 'pcap'] }).notNull(),
        destinationKind: text('destination_kind', { enum: ['desktop', 'server'] }).notNull(),
        destinationToken: text('destination_token'),
        nativeLeaseToken: text('native_lease_token'),
        artifactPath: text('artifact_path'),
        partialPath: text('partial_path'),
        packetsTotal: text('packets_total').notNull().default('0'),
        packetsWritten: text('packets_written').notNull().default('0'),
        bytesWritten: text('bytes_written').notNull().default('0'),
        retainedPortionOnly: integer('retained_portion_only', { mode: 'boolean' })
            .notNull()
            .default(false),
        cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
        leasesReleased: integer('leases_released', { mode: 'boolean' }).notNull().default(false),
        checksumSha256: text('checksum_sha256'),
        finalSize: text('final_size'),
        failureCode: text('failure_code'),
        failureMessage: text('failure_message'),
        createdAtNs: text('created_at_ns').notNull(),
        startedAtNs: text('started_at_ns'),
        completedAtNs: text('completed_at_ns'),
        updatedAtNs: text('updated_at_ns').notNull(),
    },
    (table) => [
        index('export_jobs_capture_id').on(table.captureId),
        check(
            'export_jobs_state',
            sql`${table.state} in ('queued','preparing','running','finalizing','completed','failed','cancelled','interrupted')`,
        ),
        check('export_jobs_format', sql`${table.format} in ('pcapng','pcap')`),
        check(
            'export_jobs_destination_kind',
            sql`${table.destinationKind} in ('desktop','server')`,
        ),
    ],
)

export const exportJobSegments = sqliteTable(
    'export_job_segments',
    {
        exportId: text('export_id')
            .notNull()
            .references(() => exportJobs.id, { onDelete: 'cascade' }),
        ordinal: integer().notNull(),
        captureId: text('capture_id').notNull(),
        generation: integer().notNull(),
        committedBytes: text('committed_bytes').notNull(),
        committedPackets: text('committed_packets').notNull(),
    },
    (table) => [
        primaryKey({ columns: [table.exportId, table.ordinal] }),
        foreignKey({
            columns: [table.captureId, table.generation],
            foreignColumns: [captureSegments.captureId, captureSegments.generation],
        }),
        check('export_job_segments_ordinal', sql`${table.ordinal} >= 0`),
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
        packetId: text('packet_id').notNull(),
        summaryJson: text('summary_json', { mode: 'json' }).notNull().$type<unknown>(),
    },
    (table) => [
        primaryKey({ columns: [table.captureId, table.cursor] }),
        index('capture_summaries_packet').on(table.captureId, table.packetId),
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
