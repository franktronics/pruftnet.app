# Capture Frontend

The capture workspace supports local live capture through the real libpcap/Npcap worker. Deterministic replay remains available as a development tool; user capture-file import is deferred.

## Entry And Routing

`/capture/$captureId` owns the full-height packet inspection workspace.

The home route is the idle capture workspace and redirects to the backend-owned active capture when one exists. `/captures` is the dense retained-session ledger. The control bar, display filter, packet table, statistics, packet tree, and bytes pane keep the same geometry after navigation to a running or retained capture.

The control bar uses a searchable Command popover for explicit multi-interface selection. Each entry shows its first libpcap-provided IPv4 or IPv6 address and an additional-address count; search covers all addresses. The adjacent settings button opens a modal containing BPF capture filter, per-interface promiscuous/monitor/DLT/timestamp options, and bounded snapshot/kernel-buffer/ring settings. Selection is never inferred from `node:os` data. Replay has no entry point in the product UI; it remains backend test infrastructure until capture-file import is implemented.

In Electron, interface selection, settings, and Start/Stop are portaled into a dedicated non-draggable titlebar slot. Global capture state plus New and Export actions remain visible in the application title bar on every route; starting over while a capture is active requires confirmation, then stops and deletes that capture before returning to the idle workspace. Follow tail sits at the right edge of the packet-column header because it controls table presentation rather than capture lifecycle. Server/browser mode renders the same responsibilities in the web header and workspace toolbar.

The history route uses full-row keyboard and pointer navigation, a stable inset live-state marker that does not disturb column alignment, and simple text/state filters. Row actions stop event propagation so Open, Export, and Delete remain independent of row navigation. The history surface has only a top boundary; it does not stretch a decorative bottom border across empty page space.

The application owns one global export manager rather than one dialog per capture page. Desktop
first selects a native save destination, then returns to the manager to review the path, format, and
estimated retained size before explicitly starting the export. Server presents the same confirmation
step with a server-download destination. Repeated requests reuse the current artifact when the
committed capture snapshot has not changed.

The manager lists all running exports across routes and captures, plus bounded recent results.
Independent exports may run concurrently; requests for the same capture and format share backend
artifact preparation. Each running row shows its destination, backend phase, packet counters, bytes
written, and percentage. The titlebar Export button remains global, reopens the manager from every
route, and displays estimated-size-weighted progress across all running jobs with a compact
bottom-edge rail.

The application sidebar uses off-canvas collapse on desktop. Closing it removes the complete sidebar instead of retaining an icon rail. The titlebar or web-header trigger and `Cmd/Ctrl+B` remain available to reopen it. Electron titlebar offsets preserve native controls on macOS, Windows, and Linux.

## Workspace

The desktop layout is a nested resizable workspace:

```text
toolbar
packet table | statistics
packet tree  | bytes
```

Narrow viewports keep the packet table primary and expose Statistics, Structure, and Bytes through tabs.

The packet, statistics, structure, and bytes panes do not repeat their titles in desktop headers; their
content, table columns, and mobile tabs provide the context. Packet counts and filter state live in the
display-filter toolbar.

The table uses `@tanstack/react-virtual` with fixed-height rows, stable full packet keys, a shared CSS grid for header and rows, keyboard selection, and explicit follow-tail behavior. Follow-tail is available only for an active capture, controls scrolling, and never selects packets or triggers detail requests. Retained captures stay at the user's current position and request the next summary page when the virtual pagination row enters the viewport. The display-filter toolbar performs deferred, case-insensitive text matching and can apply advanced client-side filters to loaded summaries: relative time, protocol, interface, wire length, parse status, source, and destination. While more retained pages are available, packet counts are explicitly labeled as loaded counts. Advanced filters are edited in a draft modal and only become active after Apply filters; protocol-expression parsing remains deferred.

## Summary State

Summaries are read from `ReadPacketSummaries` in batches of at most 1,024. TanStack Query owns one state object per capture with:

- up to 50,000 recent packet summaries for an active capture;
- cursor-paginated loaded pages for a retained capture;
- exclusive last cursor;
- stable first timestamp for relative time;
- terminal completion state;
- a persistent gap marker when backend or client retention loses earlier rows.

An active capture drains all currently available full pages into a local accumulator and publishes
one atomic cache update; a partial page then waits for the next capture-stream cursor watermark.
A retained capture reads one initial page and only reads another when its virtual pagination row
becomes visible. Historical pages are never installed one by one during initial navigation, so
opening a retained capture cannot look like packet replay. Packet identity and selection always use
complete `CaptureId + PacketId`, never visible row indexes.

Registry snapshots are immutable and cached by revision. Session, statistics, samples, summaries,
events, history, active capture, titlebar state, and export progress do not poll. Events retain a
bounded recent cursor window and surface warnings in the toolbar.

## Realtime synchronization

The frontend uses Effect RPC over HTTP with NDJSON streaming:

- one application stream carries capture-record and export-job changes;
- one capture-scoped stream is open only for a non-terminal capture workspace;
- both streams send a ready marker first, a heartbeat every 20 seconds, and monotonic decimal-string
  sequences;
- reconnect uses capped exponential backoff with jitter.

On every initial connection, reconnection, backend-instance change, or sequence gap, the client
subscribes first and then reads authoritative snapshots. Events received during reconciliation are
buffered and applied after the snapshot. SQLite-backed queries remain authoritative; stream messages
are bounded, idempotent invalidation hints.

Reloading the renderer destroys only its stream scopes. The application-scoped backend capture and
export fibers continue, and the replacement renderer rebuilds state from backend snapshots plus
durable summary/event cursors. Transient selection, filters, scroll, and pane state are intentionally
not restored.

## Selected Packet Detail

Selecting a row performs one binary request to:

```text
GET /capture/:captureId/packets/:packetId?registryRevision=...&analysisRevision=...
```

The URL is derived from the RPC endpoint while preserving Electron's random query token. Requests carry TanStack Query's abort signal and obsolete selections are cancelled.

PRT2 verification and model construction run in a dedicated module Web Worker. The response `ArrayBuffer` is transferred to the worker. The worker verifies configured budgets, registry revision, and complete packet identity before returning a compact structured-clone model with exclusively owned data-source buffers.

React never parses or verifies PRT2 on the UI thread. Detail cache keys contain capture ID, packet ID, analysis revision, and registry revision. Analysis pending, intentional spool eviction, invalid persisted data, and unavailable transport are distinct states. Intentional eviction is not labeled capture loss.

## Tree And Bytes

The tree is reconstructed from ordered `parentIndex` records and preserves repeated fields. Registry descriptors provide labels. Tree rows expose typed values and source-relative ranges with accessible disclosure navigation. A field value can be copied directly without changing row selection; `Cmd/Ctrl+C` copies the selected field value. Clipboard failures use a synchronous browser fallback and an accessible status announcement.

Opening a packet detail does not select a tree node or byte range. Selecting a source-backed tree node chooses its data source and highlights the exact byte range; selecting a byte then chooses the deepest matching node. Derived sources are supported by the model even though current stateless parsing normally exposes only source zero.

The byte pane virtualizes 16-byte rows, renders synchronized hex and ASCII, and uses one keyboard focus surface rather than one tab stop per byte.

## Statistics

The statistics pane is a capture ledger, not one aggregate loss number. It stores at most 1,000 adjacent one-second snapshots and charts observed, persisted, and analyzed rates plus maximum packet-or-byte queue pressure. This is a rolling client-side window: a new sample replaces the oldest sample after the 1,000-sample limit, so it represents roughly the latest 17 minutes rather than the complete capture lifetime.

The compact dashboard uses sparklines and opens the same ledger component in an expanded statistics dialog. The expanded throughput chart adds time and packet-rate axes, hover values, and monotone curves. Metric help controls stay hidden until their complete field row is hovered or the control receives keyboard focus. Statistics sections use spacing rather than decorative left borders.

The ledger separates capture source, per-interface application queue, persistence, intentional retention, and analysis. Tooltips identify the measurement point, permanence, recovery behavior, and relevant tuning control. A live conservation section compares observed transitions, accepted-to-persisted transitions, and persisted-to-analysis outcomes. `ipcDrops` and the `IPC` label do not exist.

The UI renders intentional spool eviction in a retention tone. Kernel/interface loss, application queue loss, and terminal write loss use failure tones. Analyzer backlog remains healthy while raw packets are committed and retained.

All counters remain decimal strings or `bigint`; they are never coerced to JavaScript numbers.

Rate deltas remain `bigint`. Only bounded chart coordinates are converted to numbers, with values above the safe integer range clamped for visualization. Chart animation stops with the capture and honors the operating system reduced-motion preference.

## Package Boundaries

`@repo/packet-codec` owns the browser-safe packet reader, generated FlatBuffers accessors, registry/value-tag mapping, and codec tests. It compiles to `dist` so consumers with `erasableSyntaxOnly` do not process generated TypeScript enums. Both backend and frontend consume this package; frontend does not import `@repo/core`.

Capture-specific components, hooks, models, and query policies stay under `packages/front/src/pages/capture`. Generic UI primitives remain in `packages/ui`.

## Deferred Work

- optional OS-specific MAC address enrichment;
- explicit DLT and timestamp selection in the frontend;
- packaged privilege installation and helper signing on Linux, macOS, and Windows;
- remote authentication and authorization;
- user capture-file import and history.
