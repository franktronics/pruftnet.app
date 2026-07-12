# Backend Sniffing

The first backend sniffing slice provides deterministic offline replay through the real C++ capture and parser pipeline. Both Electron and server mode consume the same services from `packages/core`.

## Architecture

```text
Effect RPC / binary packet route
  -> Capture service
  -> supervised pruftnet_replay_worker process
  -> OfflinePcapPacketSource
  -> NetworkSniffer parser callback
  -> bounded raw store + summary/event journals
```

The worker remains a separate process. The current replay protocol uses bounded newline-delimited JSON for low-rate control and summary data. Selected packet trees are PRT2 FlatBuffers. The worker currently base64-encodes PRT2 on the private process boundary; the public HTTP route decodes it and returns binary bytes. Production live capture must replace packet data transfer with the planned shared-memory batching path.

## Configuration

`PRUFTNET_REPLAY_WORKER_PATH` selects the worker executable. The development default is `packages/core/cpp/build/pruftnet_replay_worker` relative to the process working directory.

`PRUFTNET_REPLAY_FILES` is a JSON object mapping opaque local file IDs to trusted pcap paths:

```json
{
    "demo": "/absolute/path/to/capture.pcap"
}
```

RPC clients submit only the opaque file ID. They cannot submit an arbitrary filesystem path.

## RPC Contract

The shared contract is exported from `@repo/shared/capture` and merged into `AppRpcGroup`.

- `ListCaptureInterfaces`
- `GetCaptureInterfaceCapabilities`
- `StartCapture`
- `StopCapture`
- `GetCaptureSession`
- `ReadPacketSummaries`
- `GetRegistrySnapshot`
- `GetCaptureStats`
- `ReadCaptureEvents`

`StartCapture` accepts tagged `Replay` and `Live` sources. `Live` currently returns `CaptureSourceUnsupported` so the frontend contract does not need to change when live capture is enabled.

Only one capture is active per backend process. Capture-bound operations carry and verify the complete 128-bit capture identity in TypeScript and C++. A stale client cannot stop or read a replacement capture.

All unsigned 64-bit values cross JSON boundaries as canonical decimal strings. A capture ID is a 32-character lowercase hexadecimal string. Packet IDs remain sparse and are never used as storage indexes.

## Summary Reads

Summaries are read in bounded batches of at most 1,024 entries. A request supplies an optional delivery cursor. A response reports:

- first and last returned cursors;
- oldest and newest retained cursors;
- whether a client gap occurred before the first result;
- whether replay is complete;
- packet summaries in delivery order.

The cursor represents journal delivery order, not cross-interface timestamp order. Shared C++ parser logic resolves registry field IDs once and emits bounded source, destination, protocol, length, and protocol-aware info columns. The frontend does not reconstruct these columns by loading every packet detail.

## Selected Packet Route

`GET /capture/:captureId/packets/:packetId` returns `application/vnd.pruftnet.packet-tree`.

The response is the verified PRT2 tree. Source zero contains the complete retained captured frame, so a separate raw-byte endpoint is unnecessary. Expected outcomes are:

- `200`: immutable PRT2 bytes;
- `400`: invalid packet key;
- `404`: unknown capture or packet;
- `410`: packet was retained and later evicted;
- `503`: worker or encoding failure.

The current response does not yet include packet metadata in a selected-packet FlatBuffers envelope. The frontend combines the tree with its selected summary until that envelope is introduced.

## Retention And Loss

The replay worker currently retains at most 4,096 packets, 64 MiB of packet payload bytes, 8,192 summaries, and a bounded event journal. A new capture clears all previous session stores and resets delivery cursors.

Raw bytes are copied before the C++ parser callback returns. Selected detail reparses retained bytes on demand rather than retaining every parsed tree.

Loss remains separated into:

- kernel/libpcap drops;
- application capture-ring drops;
- retention eviction;
- retention rejection;
- callback/journal or IPC failure;
- client cursor gaps.

Exact bounded tombstones distinguish an evicted retained packet from a sparse, rejected, or never-observed packet ID. Once an old tombstone ages out, lookup conservatively returns unknown rather than falsely claiming eviction.

The replay callback currently uses short blocking critical sections to avoid timing-dependent loss during deterministic replay. This policy must not be reused unchanged for high-volume live capture; live integration requires a bounded producer queue or shared-memory handoff outside the parser callback.

## Process And Security

The Effect Layer owns the worker process. Requests are serialized, correlated, size-limited, and time-limited. Timeout, interruption, malformed framing, response overflow, or correlation mismatch makes the worker terminal so a late response cannot desynchronize later requests. Layer shutdown sends `SIGTERM`, waits for exit, and falls back to `SIGKILL` within a bounded interval.

The server host is loopback-only until remote authentication and authorization exist. Electron binds to loopback and requires a random per-process token in the RPC/detail URL. Browser origins outside the local Electron development origins are rejected. Packet payloads are never logged.

## Validation

The C++ suite covers bounded retention, exact eviction classification, cursor gaps, event journals, restart isolation, malformed and oversized worker input, stale capture identities, selected PRT2 encoding, and offline replay.

The TypeScript suite covers schema precision, RPC limits, worker lifecycle and terminal failures, concurrent starts, stale response identities, native worker replay, summary adaptation, stats, and selected packet detail.

## Deferred Work

- Shared-memory packet batches for live throughput.
- Product file picker/upload and file-ID registration.
- Display filters and configurable summary columns.
- Selected-packet metadata envelope.
- Multi-session capture.
- Persistent capture history and pcapng output.
- Remote authentication, authorization, and rate limits.
- Windows Unicode replay-path transport.
