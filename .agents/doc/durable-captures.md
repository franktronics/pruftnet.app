# Durable Captures and Exports

## Ownership

Capture sessions are application-scoped backend resources. Export requests produce or reuse a cached
artifact; they are not retained as user-visible jobs or history.

`AppDataPaths` is the path authority. The durable layout is:

```text
dataRoot/
  pruftnet.sqlite
  captures/<captureId>/{segments,indexes,recovery}/
  exports/<captureId>/{artifact.pcapng,artifact.pcap,*.partial}
  locks/instance.lock
```

Desktop and Server share the same durable root. Development uses
`<workspace>/.data/pruftnet`; production uses the platform `Pruftnet` data directory. Both runtimes
honor `PRUFTNET_DATA_DIR` as an explicit override. Tests must provide an isolated temporary root.

The shared root is single-instance storage. The instance lock deliberately rejects a second live
Desktop or Server process using the same root. Switching runtimes after a clean shutdown exposes the
same captures and exports without copying or synchronization.

## Startup and persistence

Startup resolves and canonicalizes paths, acquires the instance lock, opens SQLite, enables WAL,
foreign keys, and a five-second busy timeout, runs Drizzle migrations, checks database integrity,
reconciles interrupted records with pcapng files, and only then exposes RPC/HTTP.

SQLite contains capture sessions, committed segment generations and offsets, one export artifact
cache record per capture and format, compact statistics samples, summary cursors, summaries, and
events. Packet data remains in pcapng. UInt64 values are stored and compared as decimal text.

Capture states are:

```text
preparing -> capturing -> stopping -> stopped
                       \-> failed
capturing/stopping after crash -> interrupted -> recovering -> stopped|failed
stopped|failed|interrupted -> deleting -> deleted
```

The database row and permanent spool directories exist before C++ starts. The worker receives the
capture ID and canonical segment directory explicitly. Recovery validates each complete pcapng block,
truncates only an interrupted partial tail, preserves unknown files, and never restarts live capture.

## Exports

An export request snapshots committed segment offsets and computes a source fingerprint. A matching
artifact is reused; otherwise the current artifact for that capture and format is atomically replaced.
There is no export history, retry record, or completed-job ledger. Concurrent requests for the same
capture and format share one preparation fiber.

Progress is transient in-memory state exposed through `GetExportProgress`. It reports preparation,
encoding, cache reuse, finalization, and delivery with decimal-string packet and byte counters. The
state disappears when the request finishes and is never written as export history.

Database segment leases protect a snapshot while it is encoded. During an active ring capture, C++
also leases the selected generations so retention cannot evict them. These leases are transient and
startup clears any counts left by a crashed process.

- pcapng supports one or multiple interfaces. Segment headers are validated and a single canonical
  section is written; segments are never blindly concatenated.
- pcap supports exactly one interface and preserves timestamp precision, captured/wire lengths, and
  link type.
- Desktop consumes a one-use opaque token created by Electron's native save dialog. It copies the
  cached artifact beside the selected destination as `.partial`, syncs, and atomically renames it
  without exposing arbitrary filesystem access to React.
- Server serves the cached artifact below `dataRoot/exports`. The loopback-only HTTP endpoint supports GET, HEAD,
  single byte ranges, resumption, length, disposition, and SHA-256 metadata. Remote binding remains
  disabled until application authentication exists.

## Shutdown

The shutdown coordinator first rejects new mutations. Desktop confirms stopping an active capture
and cancelling active artifact preparation; a failure keeps the app open. Server stops the active
capture and interrupts artifact preparation. Workers have a 30-second coordinated shutdown bound.
HTTP and files close before SQLite checkpoints and closes; the instance lock is released last by the
Effect scope.

## UI recovery

`/captures` is the retained-session ledger. `/` redirects to an active capture when one exists, and
`/capture/:captureId` reloads backend state. Stored summaries, events, final statistics, and compact
statistics samples rebuild the workspace independently of polling frequency. Packet detail requests
for inactive sessions stream the requested packet from the validated pcapng segment and run the same
native parser used during live capture, including after a full backend restart.
