# Capture Frontend

The first capture workspace is driven by deterministic replay. It uses the real C++ parser and backend contracts, but it does not expose capture-file import or live interface controls yet.

## Entry And Routing

`/capture/$captureId` owns the full-height packet inspection workspace.

Home displays `Start replay` only in development when `VITE_REPLAY_FILE_ID` is configured. The value is an opaque ID resolved by the backend `PRUFTNET_REPLAY_FILES` allowlist. The UI never accepts or displays a filesystem path.

The previous single-interface selector based on `node:os` has been removed from the capture entry flow. A multi-interface selector will be designed with live capture, using C++ capture descriptors and capabilities as its source of truth and OS addresses only as optional enrichment.

## Workspace

The desktop layout is a nested resizable workspace:

```text
toolbar
packet table | statistics
packet tree  | bytes
```

Narrow viewports keep the packet table primary and expose Statistics, Structure, and Bytes through tabs.

The table uses `@tanstack/react-virtual` with fixed-height rows, stable full packet keys, a shared CSS grid for header and rows, keyboard selection, and explicit follow-tail behavior. Follow-tail only controls scrolling; it never selects packets or triggers detail requests.

## Summary State

Summaries are read from `ReadPacketSummaries` in batches of at most 1,024. TanStack Query owns one bounded state object per capture:

- up to 50,000 packet summaries;
- exclusive last cursor;
- stable first timestamp for relative time;
- terminal completion state;
- a persistent gap marker when backend or client retention loses earlier rows.

Incoming cursor-ordered batches are merged incrementally. A full batch is drained immediately; a partial batch waits before polling again. Packet identity and selection always use complete `CaptureId + PacketId`, never visible row indexes.

Registry snapshots are immutable and cached by revision. Session and stats polling stop after a final terminal read. Events retain a bounded recent cursor window and surface warnings in the toolbar.

## Selected Packet Detail

Selecting a row performs one binary request to:

```text
GET /capture/:captureId/packets/:packetId
```

The URL is derived from the RPC endpoint while preserving Electron's random query token. Requests carry TanStack Query's abort signal and obsolete selections are cancelled.

PRT2 verification and model construction run in a dedicated module Web Worker. The response `ArrayBuffer` is transferred to the worker. The worker verifies configured budgets, registry revision, and complete packet identity before returning a compact structured-clone model with exclusively owned data-source buffers.

React never parses or verifies PRT2 on the UI thread. Detail cache keys contain capture ID, packet ID, analysis revision, and registry revision. Packet eviction is rendered distinctly from loading, unavailable transport, and invalid detail.

## Tree And Bytes

The tree is reconstructed from ordered `parentIndex` records and preserves repeated fields. Registry descriptors provide labels. Tree rows expose typed values and source-relative ranges with accessible disclosure navigation.

Selecting a source-backed tree node chooses its data source and highlights the exact byte range. Selecting a byte chooses the deepest matching node. Derived sources are supported by the model even though current stateless parsing normally exposes only source zero.

The byte pane virtualizes 16-byte rows, renders synchronized hex and ASCII, and uses one keyboard focus surface rather than one tab stop per byte.

## Statistics

The statistics pane shows current counters and health only. It does not build historical graphs.

- packets seen, enqueued, parsed, and retained;
- calculated packet rate from adjacent snapshots;
- pcap, interface, application-ring, retention-rejection, IPC, and eviction counters;
- retained bytes;
- parser state;
- per-interface thread and ring state.

All counters remain decimal strings or `bigint`; they are never coerced to JavaScript numbers.

## Package Boundaries

`@repo/packet-codec` owns the browser-safe packet reader, generated FlatBuffers accessors, registry/value-tag mapping, and codec tests. It compiles to `dist` so consumers with `erasableSyntaxOnly` do not process generated TypeScript enums. Both backend and frontend consume this package; frontend does not import `@repo/core`.

Capture-specific components, hooks, models, and query policies stay under `packages/front/src/pages/capture`. Generic UI primitives remain in `packages/ui`.

## Deferred Live Work

- capture interface multi-selection;
- joining libpcap descriptors with OS address/MAC data;
- promiscuous and monitor mode;
- BPF, snaplen, DLT, and timestamp controls;
- shared-memory live packet batches;
- remote authentication and authorization;
- user capture-file import and history.
