# Durable Captures and Exports

## Ownership

Capture sessions and export jobs are application-scoped backend resources. RPC requests only create,
inspect, or explicitly mutate them. React navigation, request cancellation, refresh, and browser
disconnects do not own their lifetime.

`AppDataPaths` is the path authority. The durable layout is:

```text
dataRoot/
  pruftnet.sqlite
  captures/<captureId>/{segments,indexes,recovery}/
  exports/<exportId>/{artifact.partial,artifact.pcapng|artifact.pcap}
  locks/instance.lock
```

Development roots are `<workspace>/.data/desktop` and `<workspace>/.data/server`. Production uses
the platform data directory; Server supports `PRUFTNET_DATA_DIR`. Tests must provide an isolated
temporary root.

## Startup and persistence

Startup resolves and canonicalizes paths, acquires the instance lock, opens SQLite, enables WAL,
foreign keys, and a five-second busy timeout, runs Drizzle migrations, checks database integrity,
reconciles interrupted records with pcapng files, and only then exposes RPC/HTTP.

SQLite contains capture sessions, committed segment generations and offsets, export jobs and their
immutable segment snapshots, export leases, compact statistics samples, summary cursors, summaries,
and events. Packet data remains in pcapng. UInt64 values are stored and compared as decimal text.

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

Export states are:

```text
queued -> preparing -> running -> finalizing -> completed
                           \-> failed|cancelled|interrupted
```

Creation is idempotent. It snapshots committed segment offsets and acquires database leases. During
an active ring capture, C++ also leases the selected generations so retention cannot evict them.
Leases are idempotently released after terminal cleanup; a pending capture deletion is finalized only
after the last lease and physical removal succeed.

Every job has independent sequential I/O and bounded block memory. There is deliberately no global
concurrency limit or quota, so operators must account for aggregate file descriptors, storage
bandwidth, CPU, and destination capacity.

- pcapng supports one or multiple interfaces. Segment headers are validated and a single canonical
  section is written; segments are never blindly concatenated.
- pcap supports exactly one interface and preserves timestamp precision, captured/wire lengths, and
  link type.
- Desktop consumes a one-use opaque token created by Electron's native save dialog. It writes beside
  the selected destination as `.partial`, syncs, validates, and atomically renames without exposing
  arbitrary filesystem access to React.
- Server writes only below `dataRoot/exports`. The loopback-only HTTP endpoint supports GET, HEAD,
  single byte ranges, resumption, length, disposition, and SHA-256 metadata. Remote binding remains
  disabled until application authentication exists.

## Shutdown

The shutdown coordinator first rejects new mutations. Desktop confirms stopping an active capture
and cancelling exports; a failure keeps the app open. Server stops the active capture and marks
unfinished exports interrupted. Workers have a 30-second coordinated shutdown bound. HTTP and files
close before SQLite checkpoints and closes; the instance lock is released last by the Effect scope.

## UI recovery

`/captures` is the retained-session ledger. `/` redirects to an active capture when one exists, and
`/capture/:captureId` reloads backend state. Stored summaries, events, final statistics, and compact
statistics samples rebuild the workspace independently of polling frequency. Packet detail requests
for inactive sessions stream the requested packet from the validated pcapng segment and run the same
native parser used during live capture, including after a full backend restart.
