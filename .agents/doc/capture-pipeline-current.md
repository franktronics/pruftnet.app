# Current Capture Pipeline Baseline

This document records the pre-spool architecture that existed before the capture-first migration. It is a regression baseline, not the target design.

## Ownership and flow

```text
interface
  -> libpcap/Npcap kernel buffer
  -> one capture thread per interface
  -> one fixed-slot SPSC PacketRing per interface
  -> one shared parser thread
  -> worker packet callback
  -> mutex-protected pending packet deque
  -> worker consumer thread
  -> RawPacketStore + SummaryJournal
  -> newline-delimited JSON on worker stdout
  -> Node Capture service and Effect RPC
  -> React polling and packet detail HTTP route
```

The capture callback assigns the capture-scoped packet ID before queue admission. It copies the packet into the interface ring and returns. The shared parser thread drains the rings round-robin, performs full dissection, calls the worker callback, and then releases the ring slot.

The worker callback copies raw bytes and a parsed summary into a second queue. Live capture uses `try_lock`; mutex contention, queue saturation, byte saturation, allocation failure, summary extraction failure, retention failure, journal failure, and callback exceptions all increment the same `ipcDrops` counter.

## Queues and limits

| Stage | Owner | Packet limit | Byte limit | Allocation model | Saturation behavior |
| --- | --- | ---: | ---: | --- | --- |
| libpcap/Npcap buffer | OS/libpcap | platform-specific | configured per interface, 64 MiB default | platform-specific | kernel/interface counters when supported |
| Interface `PacketRing` | capture thread producer, parser thread consumer | 65,536 per interface by default | `ringSlots * snaplen` plus descriptors; no byte occupancy limit | every slot reserves a full `snaplen` payload | newest packet rejected; one ambiguous ring-drop reason |
| Worker pending deque | parser callback producer, worker consumer | 4,096 | 64 MiB | heap allocation and copy per packet | live `try_lock` or either capacity limit rejects the packet |
| `RawPacketStore` | worker consumer | 4,096 | 64 MiB | heap-owned packet copies | oldest retained packet evicted or oversize packet rejected |
| `SummaryJournal` | worker consumer | 8,192 | none | heap-owned summaries | oldest summary evicted independently of raw bytes |
| `EventJournal` | capture callbacks | 1,024 | none | heap-owned events | oldest event evicted; failure joins `ipcDrops` |
| Worker request/response | worker main thread and Node | one request in flight | 64 KiB request, 16 MiB response | newline-delimited JSON strings | timeout, interruption, overflow, malformed JSON, or ID mismatch terminates the worker |

## Thread and process boundaries

- Each interface owns one libpcap handle, capture thread, fixed-slot ring, and interface counters.
- `SnifferRuntime` owns one shared parser thread. Parser throughput is therefore on the loss-critical path.
- `pruftnet_capture_worker` owns capture, parsing, retention, journals, command handling, and detail generation in one process.
- The worker main thread handles every command synchronously.
- Node serializes all lifecycle, status, summary, event, and detail calls through both a service semaphore and a single-flight worker semaphore.
- React polls summaries and statistics. Packet detail is requested over HTTP, but the worker internally returns a Base64 string inside JSON before Node decodes it back to bytes.

## Failure paths

| Failure | Existing behavior before migration |
| --- | --- |
| Kernel or interface loss | Exposed through raw libpcap counters whose platform semantics vary. |
| Interface ring full or oversize packet | Both increment `appRingDrops`; the cause is not distinguishable. |
| Invalid callback payload | Packet ID is consumed, a warning is emitted, but no dedicated counter is incremented. |
| Parser slowdown | Fills the interface ring and causes permanent raw packet loss. |
| Parser exception | Emits a fatal event and requests capture stop. |
| Worker callback mutex contention | Packet is silently rejected and included in `ipcDrops`. |
| Worker pending packet or byte limit | Packet is rejected and included in `ipcDrops`. |
| Raw retention rejection or journal failure | Included in `ipcDrops`; summary and raw retention can diverge. |
| Raw retention eviction | Raw detail disappears while its independently retained summary can remain. |
| Worker crash | All in-memory packets, summaries, and events are lost. |
| Request timeout or cancellation | Node marks the worker terminal and sends `SIGTERM`; a detail cancellation can terminate the shared capture session. |
| Detail transport | Full packet tree is Base64-encoded in worker JSON, copied into Node strings, decoded, then returned as binary HTTP. |
| Disk failure | No live capture file exists, so there is no valid persisted prefix to preserve. |
| Analyzer failure | Capture and analysis share the worker and parser path; failure can stop capture or cause ring loss. |
| Frontend disconnect | Capture continues, but only bounded in-memory journals remain and no persistent catch-up source exists. |
| Known fatal session error | Worker session JSON always returns `failure: null`. |

## Missing conservation accounting

The capture callback approximately satisfies `packetsSeen = packetsEnqueued + appRingDrops + invalidCallbackPayloads`, but invalid payloads are not counted and oversize rejection is merged with queue saturation.

There is no exact equation after the ring because `ipcDrops` merges unrelated transitions, retention and summary storage commit independently, and packets can be evicted from one store while remaining in another. A clean stop therefore cannot prove that every observed packet was persisted, rejected for one explicit reason, or left in a measured in-flight state.
