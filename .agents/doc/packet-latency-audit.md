# Packet delivery and table latency audit

Date: 2026-09-05. Branch: `feat/ui-corrections`. Reviewed application commit: `0b4dce85b7c7ba36c42ead704d71856064af5ded`.


This document describes the pre-implementation baseline. See [the implementation and measurements](packet-delivery-performance.md) for the changes made afterward.
Status: investigation and proposed design. No application implementation changes were made. Diagnostic sources and results are in `packet-latency-audit/`.

## Recommendation

Keep capture-first raw storage, stable packet identities, the shared desktop/server backend, and the indexed historical page API. Fix the native flush wakeup and the virtualizer cache invalidation first. Then replace exhaustive live catch-up with progressive, bounded delivery. For sustained high rates, introduce a binary summary data channel, a browser worker, and subscriptions scoped to the visible range or recent tail.

Changing HTTP to WebSocket alone does not remove native flush delays, synchronous database work, exhaustive catch-up, or repeated frontend scans. React and Effect do not need wholesale replacement to address the demonstrated problems.

## Scope and evidence

Inspected the recent commits, capture C++ threads and spool, worker protocol, Effect services, SQLite repositories, RPC streams, React hooks, packet table, cache, filters, and the installed TanStack Virtual implementation. Compared local Wireshark sources and current primary documentation for Wireshark, AG Grid, Perspective, Arkime, libpcap, React, TanStack, Node.js, and browser transports.

Local environment: Apple M1 Pro, Darwin arm64, Node.js 26.4.0, Electron 42.4.1, React Virtual 3.14.5 and Virtual Core 3.17.3. The native library was rebuilt from the reviewed source. The existing CMake configuration has no Release build type. Native timings here demonstrate scheduling behavior, not production throughput.

Opened the retained 213,741-packet capture, approximately 240.7 MiB of raw data, in the desktop application. Verified initial rows, direct navigation to the final rows, and TCP/UDP filtering. Temporary renderer observers were disconnected and the display filter cleared afterward. No live network capture was started.

Chrome DevTools MCP was unavailable. Desktop observations instead used Computer Use and Electron DevTools with Resource Timing, Long Tasks, an input-event timestamp, and a MutationObserver. The renderer was running through Vite in development. There is no production trace, physical display latency measurement, remote-server benchmark, or Linux/Windows validation in this audit.

## What the commits improved

| Commit | Contribution | Assessment |
| --- | --- | --- |
| `2812219` | Capture-first spool, separation of capture/analysis, framed worker protocol, binary detail artifacts and analyst workflow | Correct reliability direction. Inspect the implementation's shared I/O lock before assuming full isolation. |
| `e4c5be7` | Backend-owned durable summary drain, RPC change streams, historical manifest/range reads, cursor reconciliation | Good ownership and recovery model. The stream carries notifications; packet content still requires finite reads. |
| `0b4dce8` | Indexed incremental reads, ordered merge, byte-budgeted page cache, visible-page priority, directional prefetch, memoized rows | Useful history/navigation optimizations. The live merge still copies the retained window and the publication path still waits for catch-up completion. |

The historical `capture-pipeline-current.md` explicitly documents the pre-spool baseline. It must not be mistaken for the current implementation. The packet codec benchmark compares codecs and parser traversal, not capture-to-screen latency. Its FlatBuffers decision is relevant, but summaries in the actual application still cross the native and RPC boundaries as JSON.

## Current critical path

```text
libpcap buffering
  -> interface byte ring
  -> pcapng writer and buffered flush
  -> analyzer reopens and rereads each packet
  -> full parse, summary extraction, 32,768-entry summary journal
  -> native summary request in a 500 ms supervisor cycle
  -> JSON decode and SQLite summary transaction
  -> finish draining available summaries and events
  -> CaptureDataAvailable RPC notification
  -> frontend invalidation and ReadPacketSummaries requests
  -> read 1,024-row pages until caught up
  -> rebuild/filter retained frontend rows
  -> virtualizer, React, layout and paint
```

In quiet steady state, the supervisor scheduling alone introduces a residual wait between approximately 0 and 500 ms, averaging about 250 ms for arrivals uniformly distributed relative to the cycle. This is an analytical estimate, not an observed latency distribution. `Schedule.spaced` also leaves 500 ms after the preceding synchronization finishes, so work and scheduling delays extend the effective period. Other stages add latency; the flush defect below means there is currently no reliable 500/550 ms upper bound.

## Findings in priority order

### 1. The native flush deadline does not wake the writer

`packages/core/cpp/src/sniffing/sniffer_runtime.cpp:866` checks `flush_if_due`, then line 877 enters an atomic wait without a timeout. `PcapngSpool::flush_if_due` only checks elapsed time when called. Empty libpcap dispatches do not wake the writer. A packet arriving before the 50 ms flush threshold can stay unpublished through a subsequent idle period.

A rebuilt-library probe supplies one packet, keeps the source open and idle, and waits 300 ms. All three trials produced:

```text
after_300ms: observed=1 persisted=0 analyzed=0 callbacks=0
after_stop:  persisted=1 analyzed=1 callbacks=1
```

Fix: wait until the next pending flush deadline, with a predicate covering new work, stop, and source completion. Use an independent monotonic deadline and avoid busy polling. Preserve notification correctness across the check/wait boundary. Add a packet-then-idle regression test, including a packet just after a prior flush. The capture driver's timeout is not a substitute for this deadline.

### 2. Both backend and frontend can postpone publication while chasing a moving tail

`packages/core/src/capture/manager.ts:163` drains the native journal until caught up. Publication happens afterward at line 248, and the next cycle waits 500 ms at line 374. The frontend's `readPacketSummaryState`, starting at `use-packet-summaries.ts:120`, also continues while full 1,024-row batches arrive and returns state only at the end.

This means opening an already active capture starts at the oldest durable summaries and can download history that will immediately be discarded by the 50,000-row cap. Sustained input can defer publication indefinitely if the reader never catches up. Repeated invalidation can also interact poorly with an in-flight catch-up and its cancellation.

The existing test named `atomically catches up all currently available live pages` codifies this behavior. A diagnostic with successive full batches confirms that no state is returned before cancellation. This is a liveness problem, not merely an expensive merge.

Fix: bound each unit of work and publish progress after each batch or short time budget. Capture a fixed catch-up watermark. Track requested versus applied watermarks and continue from the applied cursor without restarting completed work. Opening a live capture should request the recent tail first. Historical ranges remain separately addressable.

### 3. Native analysis shares an I/O lock with the writer

`packages/core/cpp/src/capture/pcapng_spool.cpp:484` holds the spool mutex through segment lookup, `ifstream` creation, buffer allocation, seek, read, and close. The analyzer calls this per packet. Writer append/flush and other spool operations share that mutex.

Therefore the intended thread separation does not guarantee that slow reads or detail access cannot delay writes. Per-packet file opening and allocation also reduce throughput. The magnitude is not measured here.

Fix: take a short metadata/segment lease under lock, then perform reads outside it. Retain bounded reader-owned handles and reusable read buffers, read adjacent committed packets in batches, and preserve Windows-safe segment deletion semantics. A bounded cache of committed raw blocks can avoid rereading recent packets, with spool fallback after cache eviction. Never pass borrowed ring memory to analysis after the writer releases its slot.

### 4. Virtualization currently invalidates its own measurements every render

`packages/front/src/pages/capture/components/packet-table.tsx:153` creates a new `getItemKey` function on every render. Virtual Core includes this function in its measurement dependencies. Its single-lane implementation still traverses all logical rows when those dependencies change.

An isolated benchmark using the installed Virtual Core, an already initialized virtualizer, the application's 34-pixel row height, and unchanged counts measured approximately 4.87 ms median at 50,000 rows and 31.89 ms at 213,741 rows when replacing this function. Keeping the function reference stable reduced the same cached operation to approximately 0.001-0.002 ms. These are cache-invalidation measurements, not full React render timings.

Fix: stabilize `getItemKey` and relevant callbacks. Keep historical identity tied to a dataset and absolute ordinal; preserve packet identity and the visible anchor when trimming live data. `handleSelect` is also recreated by the workspace, defeating part of `PacketDataRow` memoization. Both desktop/mobile table trees are mounted and only hidden by CSS, so both virtualizers can perform logical work. Render only the active heavy workspace, or disable its hidden virtualizer.

TanStack explicitly recommends memoizing this callback to avoid recalculation. [TanStack Virtualizer documentation](https://tanstack.com/virtual/latest/docs/api/virtualizer#getitemkey).

### 5. The frontend still repeatedly processes its full live window

`mergeSummaryBatch` filters existing rows, builds another ordered array, trims it and recreates row wrappers. `CaptureWorkspace` filters all retained rows, recomputes time bounds and counts, and scans for selection. Even empty filters traverse the window. `useDeferredValue` changes scheduling; it does not remove these scans or move them to another thread.

Using 50,000 real stored summaries, 10 warmup iterations and 100 recorded iterations:

| Isolated Node workload | Median | p95 |
| --- | ---: | ---: |
| Merge 1,024 new summaries into 50,000 retained rows | 1.31 ms | 3.58 ms |
| Merge, default filtering, three counts and maximum relative time | 9.15 ms | 10.98 ms |
| Text filter `tcp` over 50,000 summaries | 8.40 ms | 8.95 ms |

The measurement excludes network, schema decoding, virtualizer work, DOM, charts, and paint. At 60 Hz, a frame is about 16.7 ms. Repeating these operations more frequently would consume a significant part of that budget before rendering starts.

Fix: append to bounded pages or a ring with absolute ordinals. Maintain counts, time bounds, selection lookup and active-filter result indexes incrementally. Run query/decode work in a dedicated worker. Materialize display strings only for the viewport and a small prefetch margin. Publish immutable, cached snapshots of visible data to React; do not expose mutable pages through an unchanged snapshot. [React external store contract](https://react.dev/reference/react/useSyncExternalStore).

### 6. Historical range reads are fast, but search and initial live fallback scan

Read-only SQLite probes against the retained 213,741-row capture used the same SQL shapes as the repository. Each case ran six times. Warm median uses the last five runs; the first run is not a controlled cold-disk test. Timings exclude JSON parse, Schema validation, RPC and rendering.

| Query | Returned rows | First run | Warm median |
| --- | ---: | ---: | ---: |
| First indexed range | 1,024 | 5.70 ms | 0.38 ms |
| Middle indexed range | 1,024 | 5.29 ms | 0.41 ms |
| Last indexed range | 749 | 3.29 ms | 0.22 ms |
| Initial live cursor fallback | 1,024 | 547.22 ms | 56.63 ms |
| Build text filter index for `tcp` | 18,272 | 536.25 ms | 529.80 ms |
| Build text filter index for `dns` | 0 | 546.52 ms | 548.26 ms |

`EXPLAIN QUERY PLAN` confirms indexed ordinal range access, a temporary sort for the initial live fallback, and JSON virtual-table scans for text search. `DatabaseSync` executes on the backend event loop through `Effect.try`; Effect fibers do not make this synchronous database work run on a separate CPU thread. [Node SQLite documentation](https://nodejs.org/api/sqlite.html).

The filter manifest builds the complete result index before delivering the first page. The cache has a 16 MiB budget. A result index larger than the budget is built but not retained, so subsequent range requests can rebuild it. The `.all()` intermediate allocation is not bounded by the retained index budget.

Fix: directly handle initial/tail reads by ordinal. Keep indexed range pagination. Move query and indexing work off the backend event loop. Store typed query columns rather than extracting every field from JSON, with appropriate indexes for protocol, interface, time and length. Model multi-protocol membership explicitly. For arbitrary substring search, use an appropriate candidate index plus exact verification, or an incremental scan with progress; ordinary token FTS does not preserve existing substring semantics. Do not require an exact global count before showing the first matches. Use a query generation, cancellation and a resumable/materialized result index for large results.

### 7. Live summary transport and retention are not sized for arbitrary packet rates

The native journal holds 32,768 summaries. A 500 ms gap between reads can fill it at 65,536 summaries/s even before accounting for drain work and scheduling delay. This is a capacity calculation under steady analyzed output, not a measured throughput limit. Overruns are logged, but the missing summaries are not automatically rebuilt by the current drain loop.

The first 1,024-row page contained 564,504 bytes of summary JSON, about 551 bytes per row before RPC framing. At that representative size, sending every summary at 100,000 packets/s would require approximately 55 MB/s per client before transport overhead. Binary reduces bytes and allocations; viewport scoping avoids sending most unnecessary rows.

Fix: use byte and age budgets as well as count limits. Distinguish capture loss, analysis failure, intentional raw retention, transient summary-cache eviction, and skipped display updates. Raw capture must remain independent of client credit. If a transient summary queue overflows, repair from indexed storage or reanalysis of retained raw packets, preserving any stateful dissection prerequisites.

## Desktop observations

In development, opening the capture and jumping to the last page briefly exposed loading placeholders, then the correct rows appeared. TCP filtering returned 18,272 matches and UDP filtering returned 194,812 matches.

For one TCP-to-UDP filter transition, an input listener marked the final `udp` input event. A MutationObserver detected the first visible UDP row at 1,246 ms. Two subsequent animation-frame callbacks occurred at 1,398 ms. The latter is a scheduling proxy and does not measure physical pixel presentation. Resource Timing recorded finite RPC durations of 734, 33 and 28 ms during that transition. Renderer long tasks included 59, 299, 134, 149 and 120 ms. These tasks are not individually attributed by a sampled stack profile.

The corresponding TCP observation included RPC durations of 748, 51 and 33 ms. These observations agree with expensive query work plus additional renderer work, but they do not prove that one specific function accounts for all UI delay. Development mode, DevTools and accessibility automation affect timings. Repeat in a production build with native performance traces before publishing an SLO.

## Existing products and techniques

| Reference | Relevant behavior | Application to Pruftnet |
| --- | --- | --- |
| Wireshark/dumpcap | New packet reports default to 100 ms. Local source flushes capture data before notifying the parent. The Qt model batches row insertion on the next event-loop turn and does background dissection in short budgets. | Preserve capture ownership and batch UI publication. A fast analyzer does not require one UI update per packet. |
| AG Grid | Async transactions batch by default over 50 ms. The viewport row model tells the server which rows are visible. | Use bounded batches and server knowledge of viewport/tail. This does not require adopting AG Grid. |
| Perspective | Incremental tables, columnar data, worker/server execution, and server-side virtualization of visible data. | A useful architecture reference for the summary store and worker boundary. Benchmark before introducing a separate analytics engine. |
| Arkime | Separates raw PCAP storage, session metadata/indexing, and viewer access. | Useful for storage and querying separation. Its session-oriented product is not a packet-table latency benchmark. |

Sources: [dumpcap manual](https://www.wireshark.org/docs/man-pages/dumpcap.html), [Wireshark's change from 500 to 100 ms](https://gitlab.com/wireshark/wireshark/-/merge_requests/10008), [AG Grid batching](https://www.ag-grid.com/javascript-data-grid/data-update-high-frequency/), [AG Grid viewport](https://www.ag-grid.com/javascript-data-grid/viewport/), [Perspective architecture](https://perspective-dev.github.io/guide/), [Arkime architecture](https://arkime.com/architecture), [Arkime data model](https://arkime.com/).

Local Wireshark evidence: `.repos/wireshark/dumpcap.c:4297` and `.repos/wireshark/ui/qt/models/packet_list_model.cpp:1004`. The conclusions above are architecture comparisons, not comparative throughput measurements.

## Method A: targeted changes using the current stack

1. Correct native flush deadlines and isolate spool reads from writer locking.
2. Stabilize virtualizer keys and row callbacks. Prevent hidden heavy views and unchanged statistics panels from participating in every packet render.
3. Publish bounded summary increments. Open an active capture with a tail snapshot; catch up to a fixed watermark progressively.
4. Add a typed summary-content stream to the current Effect HTTP/NDJSON transport. Reuse summary batches directly after persistence instead of publishing only an invalidation that requires rereading SQLite. Until native notifications exist, test a bounded 20-30 ms drain schedule, keeping stats on their separate slower cadence. This interval is an experiment, not an asserted optimum.
5. Keep the successful ordinal page API. Return metadata and a small first visible range together where possible. Move full filter-index work to a query worker and deliver early matches before full counting finishes.

This method addresses demonstrated latency without requiring a new transport. It still incurs JSON serialization, validation and object creation at sustained high rates. Every stream must have bounded buffers and explicit repair; replacing notifications with packet payloads in a sliding PubSub alone would lose rows for slow clients.

## Method B: recommended architecture for sustained load

```text
capture rings -> serialized pcapng writer -> committed raw blocks
                                            |
                            bounded shared block cache
                                            |
                           analyzer / summary producer
                              /                    \
               immutable binary summary pages     asynchronous index writer
                              |                    |
                  viewport/tail publisher       history/query service
                              \                    /
                      bounded binary data transport
                                   |
                        browser summary worker
                                   |
                    immutable visible-row snapshots
                                   |
                         React virtual packet table
```

Keep Effect RPC for lifecycle commands, settings, sessions, export jobs and errors. Add a versioned binary channel for packet summaries and ranges. The native framed protocol already reserves events, but `ReplayWorker` currently discards event envelopes; implementing push requires both native publication and a subscribed Node-side event path.

Use FlatBuffers summary pages with fixed records and arenas, consistent with the repository's prior codec decision. Carry capture/schema/analysis identity at batch level, preserve 64-bit timestamps and identities, and avoid repeated capture IDs and column names in each row. Validate framing, bounds, versions and identity at trust boundaries. Forward validated immutable buffers without unpacking/repacking them into per-packet objects in Node. The browser worker owns decode, local pages and view preparation. Transfer buffers with explicit ownership; transferring an ArrayBuffer detaches it from the sender, and transferable transport does not make all stages zero-copy. [Browser transfer semantics](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects).

Publish after a raw block is committed, without waiting for the derived SQLite summary index. Maintain separate raw-commit, summary-produced and summary-indexed watermarks. The backend page cache bridges the indexing lag. Recovery must reconstruct unindexed summaries from retained raw data, using replay/checkpoints where stateful parsing requires them. Under the current spool implementation, committed means successful buffered `fflush`, not guaranteed survival of power loss; stronger durability needs a separately specified sync policy.

Use a short maximum batch age, initially benchmark 4-8 ms, plus row and byte limits. Publish the first available small batch promptly. Let rendering coalesce updates to an animation frame, initially 30-60 updates/s depending on load. A continuously busy stream must not reset a debounce timer forever. Background tabs should stop detailed delivery and reconstruct a fresh tail on return.

Subscription messages identify capture, query generation, visible ordinal interval or tail mode, requested columns and available client credit. Responses identify batch sequence, revision, covered ranges, watermarks, and repair requirements. At moderate rates an append stream can deliver every summary. At high rates publish the current visible/tail window, while keeping intervening packets queryable in history. This skips intermediate screen presentations, not captured packet records. A screen cannot display every intermediate packet as a distinct frame at arbitrary arrival rates.

A slow client has a bounded number of bytes/batches in flight. When it falls behind, stop queuing obsolete views, send an explicit resynchronization marker, and resume from a fresh snapshot or durable range. Never block raw capture on client acknowledgment. Pin selected/history ranges independently so following the live tail cannot evict the user's current inspection. Session start, stop, errors and final watermarks take priority over bulk data.

On reconnect: subscribe, establish a generation and snapshot watermark, install the bounded snapshot, then apply subsequent deltas exactly once. Expired cursors trigger explicit range repair. Packet observation IDs, storage ordinals, query-result ordinals and transport sequences remain distinct. Immutable historical pages should not be invalidated whenever the live tail grows.

### Transport choice

| Transport | Use |
| --- | --- |
| Binary WebSocket | Preferred shared desktop/server data-channel candidate: persistent duplex connection for subscriptions and credit. Implement application flow control because the standard browser WebSocket API has no receiving backpressure. |
| Binary streaming HTTP with Fetch | Valid alternative, especially if existing deployment favors HTTP streams. Frame messages explicitly, ensure proxy flushing, bound server queues and carry viewport updates through a control endpoint. |
| Electron MessagePort | Optional adapter if profiling proves loopback transport material. Share the same protocol/store with server mode. Measure actual buffer copy behavior in the chosen Electron API. |
| WebTransport | Evaluate if independent streams or difficult remote networks justify HTTP/3 deployment. It does not fix the demonstrated application waits. Reliable streams, not lossy datagrams, fit authoritative packet data. |

Sources: [WebSocket behavior](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API), [WebTransport capabilities](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API), [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports).

Keep React and the existing Shadcn presentation. Consider a fixed-height arithmetic virtualizer only if stabilized TanStack remains significant at large counts: the table uses 34-pixel rows, so visible bounds can be computed from scroll offset. Verify browser scroll-range limits and anchor behavior on very large captures. Canvas/WebGL or a native grid should be justified by an actual remaining paint bottleneck.

### Optional deeper analyzer change

The table currently waits for full packet parsing before summary extraction. If that remains significant after fixing I/O and delivery, add a summary-oriented emission mode to the existing dissector traversal. Share protocol decoding and maintain required flow/reassembly state. Avoid a separate simplified parser that can disagree with details. Expensive enrichment can arrive later with an explicit analysis revision and pending status. Preserve filter correctness when a packet's enriched fields change.

Libpcap immediate mode is another independent experiment: it removes capture-driver batching where supported but can increase wakeups/CPU cost. Set it before activation, verify capabilities with Linux/libpcap, macOS/BPF and Windows/Npcap, and compare drops and CPU as well as latency. Do not assume setting a zero timeout has equivalent portable behavior. [libpcap immediate-mode documentation](https://www.tcpdump.org/manpages/pcap_set_immediate_mode.3pcap.html).

## Validation and acceptance targets

Proposed targets below apply only within an explicitly measured supported load envelope. They are not current results or hard real-time guarantees.

| Scenario | Initial target |
| --- | --- |
| Visible recent packet, desktop/local server | Capture-callback to visible-row presentation p95 below 50 ms, p99 below 100 ms |
| Warm historical page | Requested visible rows ready within 50 ms at p95 |
| First unfiltered historical viewport | Below 150 ms at p95 with application already loaded and ordinary local storage |
| Cached scrolling | No network dependency within prefetched ranges; work stays within the chosen display frame budget |
| New complex filter | Responsive input and progressive results; exact completion separately reported |
| Remote server | Separate server processing, one-way transport, and client costs; finite requests pay an RTT. No promise below the physical network delay. |

Instrument capture callback, raw commit, summary ready, native send/receive, indexing, server send, browser receive/decode, store publication, React commit and presentation trace. Use monotonic clocks within each process. Calibrate clock offsets for cross-process/remote measurements; recorded packet wall timestamps are not directly comparable to browser `performance.now()`. A replayed packet's original timestamp must not be treated as current delivery latency.

Test isolated packets followed by silence, 1/100/10,000/100,000 packets/s where the machine supports them, bursts, mixed protocols, active capture reopening, 1 million and 10 million historical rows, cold/warm cache, filter changes, selection, scrolling, 20/80/150 ms RTT, slow/background clients, disconnect/restart, index lag, ring eviction, disk pressure and clean stop. Record p50/p95/p99, oldest queue age, bytes in flight, CPU, allocations/GC, RSS/heap, event-loop delay, frame stalls and all loss counters. Do not hide saturation by reporting only average throughput.

Validate desktop on Linux, macOS and Windows, plus the browser/server path. If arrival exceeds sustainable capture capacity, preserve exact loss accounting. If only display capacity is exceeded, preserve capture and make view lag/resynchronization explicit.

## Reproduction

Run commands from the repository root. SQL/front probes open the largest stopped capture read-only and output aggregate timings, not packet payloads. An optional second argument supplies another SQLite path.

```sh
cmake --build packages/core/cpp/build --target pruftnet_sniffing -j 4
c++ -std=c++20 -Ipackages/core/cpp -Ipackages/core/cpp/src -Ipackages/core/cpp/include \
  .agents/doc/packet-latency-audit/native-idle-probe.cpp \
  packages/core/cpp/build/libpruftnet_sniffing.a -lpcap \
  -o /tmp/pruftnet-native-idle-probe
/tmp/pruftnet-native-idle-probe
node .agents/doc/packet-latency-audit/sql-probe.mjs
node --import tsx .agents/doc/packet-latency-audit/front-probe.mts
node .agents/doc/packet-latency-audit/virtualizer-probe.mjs
```

The standalone C++ compile command above was used on macOS; Windows needs the project's normal Npcap/CMake link configuration. Recorded query and frontend results are included alongside the probes. Existing targeted summary/cache tests also passed: 13 tests across two files. They do not cover native idle flushing, progressive publication, or production UI performance.
