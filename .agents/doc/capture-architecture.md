# Capture Architecture

## Ownership and flow

```text
libpcap or Npcap -> bounded queue per interface -> pcapng spool
-> asynchronous analysis -> durable SQLite summaries -> RPC and React workspace
```

The native worker owns capture, pcapng writing, analysis, and native detail
generation. `packages/core` owns worker supervision, durable capture records,
summary and event draining, exports, recovery, and RPC. The frontend owns only
display state and cached decoded summary pages. A connected client must never
be required for capture, analysis, or persistence to progress.

Capture callbacks assign a capture scoped packet ID and copy bytes into their
bounded queue. They do not parse packets. The writer is the sole queue consumer
and the only pcapng writer. A packet is persisted only after its complete block
has been written and published by the configured buffered flush. Analysis reads
persisted data, so it cannot delay capture or the writer.

## Durable capture and delivery

Application captures receive a permanent directory before native startup.
Segments contain pcapng metadata that identifies the capture, interface, and
packet. Recovery preserves a valid prefix and discards only an incomplete or
corrupt tail. Quota failure stops capture; ring retention evicts only closed
segments and reports eviction separately from capture loss.

`PacketId` is an observation identity, not an array index, and may be sparse.
Delivery cursors are independent from packet IDs and timestamps. SQLite is the
authority for summaries; a bounded native journal and frontend cache are
replaceable delivery layers. A missing range must be reported as a gap, never
shown as complete data.

Selected packet detail is a bounded `PRT2` binary artifact. The service checks
capture ID, packet ID, registry revision, and analysis revision before serving
it. HTTP cancellation affects only that request and never terminates the shared
worker. Detail work must remain isolated from lifecycle, statistics, summary,
and event commands.

## Invariants and failures

All per-capture counters are monotonic and are serialized as decimal strings.
Keep these relationships true:

```text
observed = accepted + queue drops + oversize drops + invalid callbacks
accepted = persisted + queue depth + writer in flight + terminal write losses
persisted = analyzed + analysis backlog + analysis eviction + analysis rejects
```

Kernel drops, application queue drops, retention eviction, analysis rejection,
and client delivery gaps are distinct conditions. Do not merge or relabel them.
After a clean stop, queues, writer work, and analysis backlog are empty.

Writer failures stop new capture, account for accepted but unpersisted packets,
and retain the valid spool prefix. Analysis failures record an outcome without
stopping persistence. Clean shutdown interrupts input, drains or accounts
queues, flushes and closes the spool, then lets analysis finish. Forced shutdown
may leave a recoverable incomplete tail.

## Platform and performance

Linux and macOS use libpcap; Windows uses Npcap. Keep the worker, paths, and
file operations portable. Grant capture permission only to the native worker,
never by running desktop or server as root. Measure capture changes with a
Release build on the target filesystem and workload; development measurements
are diagnostics, not throughput claims.
