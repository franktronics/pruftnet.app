# Packet delivery performance implementation

Date: 2026-09-05. Branch: `feat/packet-delivery-performance`.
Baseline: `0b4dce85b7c7ba36c42ead704d71856064af5ded`.
See [the original audit](packet-latency-audit.md) for the investigation and alternatives.

## Delivery and rendering

- The native writer now waits on the spool flush deadline as well as packet arrival. An isolated packet no longer waits indefinitely for another packet or capture stop. The default flush interval is 8 ms.
- Native segment readers reuse file handles. File reads run outside the writer metadata lock, with a separate reader mutex and shared leases preventing deletion during reads. Idle handles are capped at eight; active readers can temporarily exceed that cap.
- The supervisor checks for persisted summaries every 8 ms. Summary/event draining yields after an 8 ms work budget, except during finalization, when all outstanding data is drained before publishing a terminal state. These are scheduling targets, not real-time guarantees; an individual batch can exceed the budget.
- `StreamPacketSummaries` supplies an initial tail of at most 1,024 packets, then committed cursor batches. Each HTTP stream response is bounded to eight pages; the client consumes and reopens it from the last received cursor. A fixed revision watermark prevents chasing a moving tail. Existing read APIs remain available.
- Already persisted summaries have a server delivery cache bounded by 32 batches and an estimated 8 MiB. Missing cursors fall back to SQLite. Packet details remain separate.
- Live updates publish to React Query at most once per animation frame. Appending reuses existing row objects and incrementally maintains the time bound. The retained live window stays capped at 50,000 packets. Empty filters return the same array; unchanged filters reuse per-summary matches.
- Pausing follow mode freezes the visible live window and unsubscribes from its packet stream. Hidden documents also unsubscribe. Resuming uses a fresh tail snapshot. Capture and persistence continue independently. Older retained packets remain accessible in history.
- Only the active desktop/mobile workspace mounts its table. Packet rows use fixed-height arithmetic virtualization with work proportional to the visible window, rather than total capture length. A bounded 16,000,000-pixel scroll surface maps larger captures to logical row positions.

## Historical loading

Historical pages contain 256 summaries. Visible pages are requested before directional prefetch, with the existing shared byte-budgeted page cache retained. The manifest includes the first page to avoid a second serial round trip. Once visible queries have been seeded, embedded summaries are removed from the cached manifest so only the byte-budgeted range cache retains them.

Expensive filters run in a cancellable Node worker using a separate read-only SQLite connection. Matching ordinals are stored in indexed temporary SQLite tables instead of an unbounded JavaScript array. Temporary storage can spill to disk. Cache eviction keeps at most eight result indexes or eight million result rows, while allowing one larger result to remain pageable. Cancelling an active query terminates the worker, which is recreated for subsequent requests.

A new filter initially searches for up to 256 matches. The manifest returns those summaries with `indexing: true` and a lower-bound count. The UI displays `256+ / total` and requests the complete count after 100 ms. The next query builds the full result index. Rare filters and filters with no matches may still need a complete scan before any result can be established. Cached complete indexes answer directly.

Loading rows retain a numeric position in the first column; skeletons occupy the other columns. An asterisk and tooltip identify a temporary list position, which is replaced by the original packet number after loading. A filtered position cannot safely be inferred to equal a packet ID. Error rows retain this position alongside their retry action.

## Shutdown

After captures and exports have been finalized, HTTP connections receive five seconds to drain. Remaining connections are closed so an abandoned streaming response cannot prevent desktop or server shutdown. This does not bound or bypass capture finalization itself. Desktop shutdown was verified after using filtered history.

## Measurements

Local macOS measurements on the existing 213,741-packet capture, approximately 240.7 MiB of raw data. Values below are different measurement scopes and should not be combined into an end-to-end latency claim.

| Measurement | Result |
| --- | --- |
| Compiled desktop, first UDP filter, input to first DOM rows | 114.2 ms |
| Same interaction, two animation frames after first rows | 121.6 ms |
| Same interaction, complete count of 194,812 matches | 722.5 ms |
| Compiled desktop, TCP filter with worker already started, first DOM rows | 64.6 ms |
| Same interaction, two animation frames after first rows | 72.3 ms |
| Same interaction, complete count of 18,272 matches | 837.1 ms |
| Live preparation of 50,000 retained rows plus 1,024 new rows, including empty filter and viewport calculation | median 0.384 ms, p95 0.890 ms |
| Reusing a TCP filter across 50,000 immutable summaries | median 1.581 ms, p95 2.463 ms |
| Viewport calculation at 213,741 / 1 million / 10 million rows | medians 0.0019 / 0.0021 / 0.0020 ms |

The two desktop interactions are individual observations, not statistically meaningful percentiles. They use the compiled frontend loaded from disk and the rebuilt Electron main process. UDP was the first filter in the fresh backend. TCP used the same worker but a new filter index. The browser measurements use a temporary input listener and MutationObserver; two animation frames approximate a rendering opportunity, not a hardware display measurement.

The original development-build UDP measurement was 1,246 ms to final rows and count, with 1,398 ms to two subsequent frames. The updated development build showed first rows at 333.3 ms and final count plus two frames at 894.9 ms. Development and production timings are not directly comparable. Full counting is still a scan; the improvement is primarily earlier usable results and moving that scan off the server event loop.

A jump to the end of the UDP result displayed 30 numbered placeholders (positions 194,783 through 194,812), with no skeleton in the number cells, followed by actual packet IDs. The unfiltered table was also navigated to its final packet, 213,741.

The native isolated-packet probe now observes one persisted and analyzed packet before stop in all ten trials at the new default interval. Its callback timings include runtime startup and must not be interpreted as steady-state packet latency. The original failure was zero persisted/analyzed packets after 300 ms until stop.

Reproducible aggregate probes and raw results are in [packet-latency-audit/](packet-latency-audit/). They read the largest stopped capture without modifying it:

```sh
node --import tsx .agents/doc/packet-latency-audit/front-implementation-probe.mts
c++ -std=c++20 -Ipackages/core/cpp -Ipackages/core/cpp/src -Ipackages/core/cpp/include \
  .agents/doc/packet-latency-audit/native-implementation-probe.cpp \
  packages/core/cpp/build/libpruftnet_sniffing.a -lpcap \
  -o /tmp/pruftnet-native-implementation-probe
/tmp/pruftnet-native-implementation-probe
```

## Validation and limits

- Core: 59 tests passed, including bounded stream resume, worker cancellation/restart, preview completion, delivery cache eviction and HTTP shutdown with an abandoned response.
- Frontend: 64 tests passed, including page planning and ten-million-row viewport geometry.
- Shared contracts: 12 tests passed.
- Native: 42 CTest cases passed; two live-interface tests skipped. C++ build passed.
- Type checking and desktop main, desktop renderer, web frontend and server production builds were checked. Existing frontend bundle-size and packet-byte virtualizer warnings remain.
- Desktop interaction exercised the stored large capture, filters and remote list positions. A server instance with a separate temporary data directory served its health endpoint and compiled frontend.

Linux and Windows runtime behavior was not exercised on this macOS host. The changes use portable C++ and shared Node/React code, with explicit Windows file-handle lifetime handling. Sustained high-rate live capture, actual ten-million-packet data delivery, memory under hours of load and network-latency percentiles remain unmeasured. The ten-million-row result above measures geometry only.

This implementation retains schema-validated JSON RPC. It does not implement the optional binary/columnar transport or denormalized search fields from the audit. A strict end-to-end latency target at very high capture rates still needs rate-specific measurements before those larger changes can be justified.
