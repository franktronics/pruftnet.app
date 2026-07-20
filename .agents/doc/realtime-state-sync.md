# Realtime State Synchronization

## Transport and ownership

Pruftnet uses `@effect/rpc` HTTP with NDJSON streaming. It does not add a WebSocket or Socket.IO
transport.

- Each renderer runtime owns exactly one `AppRpcClient`. Finite calls and streams share that client
  and its root-scoped HTTP protocol; multiple clients must never consume the same protocol because
  request routing state belongs to the client instance.
- `WatchApplicationChanges` is always open and carries durable capture-record changes plus transient
  export-job snapshots.
- `WatchCaptureChanges(captureId)` is open only while a non-terminal capture workspace is mounted.
  It carries session/stat snapshots and durable summary/event cursor watermarks.
- The backend owns one sliding application hub (256 messages) and one sliding capture hub
  (32 messages per subscriber). Slow subscribers cannot create unbounded memory.
- Application sequences are global. Capture sequences are independent per capture. All sequence and
  cursor values are decimal strings.

Heartbeat events are emitted every 20 seconds. Stream reconnection uses exponential backoff starting
at 250 ms, capped at 10 seconds, with jitter.

## Convergence

SQLite capture records, summaries, events, statistics, and cursor-based queries are authoritative.
Realtime messages are idempotent snapshots or invalidation hints.

The client follows this order:

1. subscribe and receive the stream-ready marker;
2. start authoritative finite snapshot reads;
3. buffer stream messages received while those reads run;
4. install the snapshot;
5. apply buffered messages in delivery order.

The same reconciliation runs after a backend instance change or sequence gap. This closes the race
between subscribing and fetching without requiring an unbounded application event log.

## Capture and reload lifecycle

The backend capture manager drains native summaries/events every 500 ms and persists them before
publishing cursor watermarks. Statistics and durable capture counters are sampled every second.
Export job changes are coalesced to at most one publication per 250 ms, with immediate start and
terminal publications.

The manager's capture supervisor is explicitly interruptible even though it is started during the
uninterruptible capture-start transaction. A stop first interrupts and awaits that supervisor, then
stops the native worker, performs one final durable synchronization, and publishes terminal state.

A renderer reload closes its Effect stream scopes only. Desktop main/server fibers, the native
worker, capture persistence, and export jobs continue. The replacement renderer reconstructs
backend-owned state; transient filters, selection, scroll, and layout state reset.

Desktop application quit remains different from renderer reload: it rejects mutations, stops and
finalizes capture, cancels exports, stops accepting new HTTP connections, closes realtime streams,
then awaits HTTP and closes the application Effect scope. If finalization fails, the hub is not
closed and the app remains open.
