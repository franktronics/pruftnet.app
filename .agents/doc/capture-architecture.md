# Capture-First Architecture

## Information flow and ownership

```text
libpcap/Npcap
  -> one capture thread and bounded SPSC byte queue per interface
  -> one serialized pcapng writer
  -> live segmented pcapng spool and committed-packet index
  -> asynchronous analyzer
  -> bounded compact-summary journal
  -> framed worker control protocol
  -> Effect capture service and RPC
  -> React capture ledger and binary packet-detail route
```

The capture callback assigns a capture-scoped observation ID and copies the frame into its interface queue. It performs no parsing and allocates no heap memory after queue warm-up. The writer is the only consumer of loss-critical queues and the only pcapng block writer. A packet becomes committed only after its complete Enhanced Packet Block has been written and the configured buffered flush succeeds.

The analyzer reads committed packet bytes back from the spool by committed ordinal. Parser latency, summary extraction, detail generation, UI polling, and UI disconnects cannot block capture threads or the writer. Multi-interface file order is writer service order, not a claim of strict timestamp order; original timestamps and interface IDs remain authoritative.

The current implementation separates writer and analyzer responsibilities into threads inside `pruftnet_capture_worker`. No Lua code runs in the worker. A separately sandboxed analyzer process and post-open privilege dropping remain platform-hardening work; see Platform notes.

## Queue memory

Each interface owns a descriptor ring plus circular byte buffer. Capacity is bounded independently by packets and bytes. Packet payload storage therefore tracks actual captured lengths instead of reserving `ringSlots * snaplen` bytes. Wrap padding is charged to byte occupancy, so memory use stays predictable. The callback returns one exact result: accepted, packet-capacity reached, byte-capacity reached, oversize, or invalid callback payload.

There is no global hot-path mutex between interfaces. The writer services queues round-robin and serializes file blocks.

## pcapng spool

Every segment contains one Section Header Block, one Interface Description Block per capture interface, and Enhanced Packet Blocks. Standard comment options carry the 128-bit capture ID, stable interface ID, packet observation ID, and capture flags. IDBs preserve link type, snap length, interface name, and timestamp resolution.

The spool uses buffered sequential I/O. It does not call `fsync` per packet. `spoolFlushBytes` and `spoolFlushInterval` control commit publication. Rotation flushes pending blocks before closing a segment; internally committed packets are deferred until the writer publishes them, so rotation cannot lose commit notifications.

The in-memory committed index maps both file ordinal and sparse packet ID to segment, block offset, payload offset, and block length. `recover_segment` validates duplicated block lengths, section identity, interfaces, packet identity comments, and bounds. An incomplete or corrupt tail can be truncated to the last valid block. The valid prefix is retained after short writes, disk-full errors, flush failures, or process crashes.

Policies:

- temporary: the default session file is removed only when its owner is destroyed after a clean finalization;
- failed temporary capture: retained for recovery and troubleshooting;
- quota without ring mode: capture stops with a typed quota failure;
- segmented ring mode: the oldest closed segment is intentionally deleted, and packet/byte eviction counters increase;
- active segments are never evicted.

Desktop and server mode pass spool policy through the shared `LiveCaptureSource`; core defaults to the platform temporary directory when no directory override is supplied.

## Packet identity and cursors

`CaptureId` changes on every successful start. `PacketId` is assigned at observation and may contain gaps when an observation is explicitly rejected. It is not an array index. Committed ordinal is dense file order and rebuildable from pcapng.

Summary cursors are delivery-order cursors, independent from packet IDs and timestamps. The compact summary journal is bounded and UI polling does not drive analysis. A client behind summary retention receives `gapBeforeFirst`; missing summaries are never silently presented as a complete range. The raw packet can still be queried from the spool when summary retention has expired.

## Worker and transport

Worker protocol version 2 uses a 32-bit little-endian length followed by bounded UTF-8 JSON control data. Every request has an ID. Responses use `kind: response`; asynchronous envelopes reserve `kind: event`. Node keeps timed-out or cancelled requests in its correlation table until the late response is drained. Normal cancellation never terminates the capture worker.

Control messages are limited to 64 KiB, worker responses to 4 MiB, pending requests to 1,024, and pending native detail jobs to 64. Detail generation runs on a dedicated native executor so a queue of detail requests cannot block lifecycle, stats, summary, or event commands.

Packet trees never cross the worker boundary as Base64 or JSON. The worker writes a bounded temporary `PRT2` detail artifact beside the spool and returns its path and exact length. Node verifies the absolute detail filename, reads the bytes, removes the artifact, and serves `application/vnd.pruftnet.packet-tree`. HTTP cancellation cancels or ignores only the requesting Effect; the framed response is still drained.

Detail validation covers capture ID, packet ID, registry revision, and analysis revision. Outcomes are packet not found, intentionally evicted, analysis pending, corrupt/failed analysis, or worker unavailable.

## Statistics definitions

All counters are cumulative and monotonic for one capture. Unsigned 64-bit values cross TypeScript boundaries as decimal strings.

Capture source:

- `packetsObserved`: callbacks delivered by libpcap to Pruftnet, including explicitly rejected callback payloads.
- `pcapReceived`: raw `pcap_stats.ps_recv` where supported.
- `pcapKernelDrops`: raw `pcap_stats.ps_drop`.
- `pcapInterfaceDrops`: raw `pcap_stats.ps_ifdrop`.
- `pcapDispatchCalls`: calls to dispatch.
- `pcapDispatchErrors`: dispatch calls that returned errors.
- `pcapStatsReadFailures`: failed reads of platform capture statistics.

Libpcap counter meaning and availability vary across Linux, macOS, and Windows/Npcap; they are displayed without pretending they have identical kernel semantics.

Per-interface capture queue:

- `captureQueueAccepted`: observations copied into the queue.
- `captureQueueFullDrops`: packet- or byte-capacity rejection, permanently lost at the application queue.
- `captureQueueOversizeDrops`: one packet exceeded the queue's maximum storable size.
- `invalidCallbackDrops`: invalid callback payload, such as a null data pointer for a non-empty packet.
- `captureQueueDepth`, `captureQueueBytes`: current occupancy.
- `captureQueueCapacityPackets`, `captureQueueCapacityBytes`: configured bounds.
- `captureQueueMaxDepth`, `captureQueueMaxBytes`: capture high-water marks.

Persistence:

- `packetsPersisted`: complete packet blocks published after a successful flush.
- `spoolBytesWritten`: bytes accepted by the sink, including pcapng headers and options.
- `spoolWriteRate`: backend delta rate in bytes per second.
- `spoolSegments`: currently retained segments.
- `spoolQuotaBytes`, `spoolBytesRetained`: configured quota and retained bytes.
- `spoolEvictedPackets`, `spoolEvictedBytes`: intentional retention eviction, never labeled capture loss.
- `spoolWriteFailures`, `spoolFlushFailures`: unrecoverable persistence failures.
- `lastCommittedPacketId`: highest published packet observation ID; file order can differ across interfaces.
- `writerInFlight`: complete blocks written but not yet published as committed.
- `terminalWriteLosses`: accepted packets not persisted after a terminal writer failure.

Analysis:

- `packetsAvailableForAnalysis`: cumulative committed packets handed to analysis.
- `packetsAnalyzed`: packets successfully parsed and delivered to summary extraction.
- `analysisBacklogPackets`, `analysisBacklogBytes`: committed work without a terminal analysis outcome.
- `analysisErrors`: parser, persisted-data, summary, or callback failures.
- `analysisResourceLimits`: parses completed with the bounded resource-limit condition.
- `analysisGapCount`: committed packets with an explicit non-summary outcome.
- `analysisEvictedBeforeAnalysis`: gaps caused by spool ring eviction.
- `analysisRejects`: corrupt data, parser failure, or summary failure.
- `summaryCount`, `summaryOldestCursor`, `summaryNewestCursor`: current compact-summary retention.
- `writerRunning`, `analyzerRunning`: current worker-thread state.

No `ipcDrops` counter exists. Cache eviction is not packet loss.

## Conservation invariants

At every snapshot:

```text
packetsObserved =
  captureQueueAccepted
  + captureQueueFullDrops
  + captureQueueOversizeDrops
  + invalidCallbackDrops
```

```text
captureQueueAccepted =
  packetsPersisted
  + captureQueueDepth
  + writerInFlight
  + terminalWriteLosses
```

```text
packetsPersisted =
  packetsAnalyzed
  + analysisBacklogPackets
  + analysisEvictedBeforeAnalysis
  + analysisRejects
```

After a clean stop, capture queue depth, queue bytes, writer-in-flight, analysis backlog packets, and analysis backlog bytes are zero. The UI renders these equalities as a live conservation ledger.

## Failure and shutdown behavior

Queue saturation and oversize rejection increment exact per-interface counters. Dispatch and stats failures are separate events. A spool open failure rejects start. Short write, disk full, quota failure, flush failure, or finalization failure records a fatal event, stops new capture, accounts accepted-but-unpersisted packets, and retains the valid prefix. Repeated warning conditions are coalesced at the source while counters continue increasing.

Analyzer and summary failures increment analysis outcomes and do not stop the writer. A frontend disconnect has no effect on capture. A Node disconnect leaves the native worker running until its owning layer shuts down; a backend process crash leaves any written pcapng prefix on disk.

Clean stop requests source interruption, drains or accounts queues, finishes complete blocks, flushes, closes the segment, publishes final offsets, and lets analysis drain. Node shutdown sends a framed shutdown request, then uses bounded TERM/KILL fallbacks. Forced termination can leave an incomplete tail, which recovery truncates.

## Platform notes

- Linux and macOS use libpcap; Windows uses Npcap and switches worker standard streams to binary mode.
- The spool uses portable filesystem paths and ordinary files, not Unix-only sockets or shared memory.
- Interface and kernel-drop semantics follow the local libpcap/Npcap implementation.
- Packaged helper signing, post-open privilege dropping, and a separately sandboxed analyzer process are not yet implemented. Deployments should grant capture capability to the worker executable only and keep its spool directory non-public.

## Benchmark methodology

Configure with `PRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON` and run `sniffing_runtime_benchmark`. It measures descriptor/byte-ring throughput at 64 and 1,514 bytes, pcapng packet and byte throughput, commit latency, write amplification, and two-interface fake-source runtime throughput with queue high-water and exact drops. Run Release builds on the target filesystem; Debug numbers are diagnostic and are not a performance claim. Compare the same fixture, compiler, build type, filesystem, flush policy, and hardware before drawing conclusions.

## Troubleshooting

- kernel loss: enlarge the libpcap buffer, reduce snap length, or reduce host load;
- queue loss: enlarge packet/byte capacity or improve spool throughput;
- writer failure: inspect the fatal capture event, free disk/quota, and retain the failed spool for recovery;
- analyzer backlog: raw capture is safe while retained; reduce dissector cost or increase spool retention;
- analysis gaps: compare eviction and rejection counters;
- conservation mismatch: preserve final stats and spool files; it is an internal invariant failure, not a counter to ignore.
