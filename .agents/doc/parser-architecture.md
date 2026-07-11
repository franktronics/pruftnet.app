# Parser Architecture Contracts

This document records the domain contracts that must remain stable while the packet parser, storage, and transport are implemented. The physical wire decision is tracked separately in `packet-codec-benchmark.md` so codec details do not leak into these contracts.

## Packet Identity

Every capture start creates a random 128-bit `CaptureId`. A retained packet is addressed by:

```text
PacketKey
  capture_id: 128 bits
  packet_id: unsigned 64 bits
```

`PacketId` uses the existing runtime observation sequence. It is assigned when libpcap delivers a packet to the capture callback, before the application ring accepts the packet. Therefore:

- IDs are unique only within a capture.
- IDs can contain gaps when an observed packet is dropped before retention.
- IDs do not expose packets lost before the libpcap callback.
- IDs do not imply timestamp order across interfaces.
- IDs must be looked up and must not be used as dense array offsets.

The capture ID prevents references from becoming ambiguous when the sequence restarts. Reassembly references always use the complete `PacketKey`.

Phase 1 implements this contract directly in `PacketMetadata::key`. `NetworkSniffer::capture_id()` exposes the current or most recent successful capture ID.

Capture IDs come from the operating system random-number generator. Capture startup fails with `CaptureIdentityUnavailable` rather than publishing a weak or partially initialized identity when the OS generator is unavailable.

Phase 1 also makes restart and stop serialization explicit, defers startup callbacks until lifecycle locks are released, and uses an atomic generation counter for parser wakeups. This is required so identity rollover cannot race source/ring replacement and so finite captures cannot hang on a lost condition-variable notification.

## Lifetimes

The existing capture-ring bytes remain valid only until the parser callback returns. The parser must copy retained bytes into a bounded raw store before the source ring slot is released.

The raw store owns selected-frame bytes. A selected packet view is available only while all of the following are available:

- The selected frame's raw bytes.
- The registry generation used to describe its fields.
- The analysis state revision required to reproduce its detail tree.

Eviction is explicit. A request for a packet whose raw bytes are no longer retained returns `PacketEvicted`; it must not return a tree without the selected frame bytes.

## Loss Accounting

Loss sources are independent and must remain distinguishable:

- Kernel or interface drops reported by libpcap.
- Application capture-ring drops.
- Raw-store eviction caused by the configured retention budget.
- Per-client delivery gaps caused by a slow frontend.

A packet-ID gap can prove an application-stage loss for an observed packet, but a contiguous sequence does not prove lossless capture.

## Analysis Revisions

Packet analysis can become richer after later packets arrive. For example, an earlier TCP segment can acquire a `reassembledIn` reference when a later segment completes the application PDU.

Every summary and selected packet view carries an `AnalysisRevision`. A detail response describes the best completed analysis state available at that revision. Clients may request the packet again after the revision advances.

## Registry Snapshots

Protocol and field definitions use stable text keys, such as `ip` and `ip.src`. A frozen `RegistrySnapshot` compiles those keys to dense unsigned 32-bit runtime IDs.

```text
RegistrySnapshot
  registry_revision
  protocols[]
  fields[]
```

Rules:

- Runtime ID zero is reserved as invalid.
- A message carries the registry revision once; occurrences carry only dense IDs.
- Runtime IDs are not durable without the matching registry snapshot.
- The first implementation freezes the registry for the lifetime of a capture.
- Future plugin reload creates a new generation instead of mutating an existing snapshot.

Phase 2 implements `ProtocolId`, `FieldId`, `RegistryRevision`, `RegistryBuilder`, and immutable `RegistrySnapshot`. IDs are assigned in registration order, and the nonzero 64-bit revision is an FNV-1a hash over the ordered canonical descriptors. Unknown IDs, invalid keys, duplicate keys, invalid UTF-8, and mutation after freeze are typed errors. The initial bootstrap contains only root/frame, unknown bytes, and diagnostics; real protocol fields are deferred to the first vertical parser slice.

## Summary Contract

The ingestion parser performs semantic analysis on every retained packet, but only materializes data needed for active summaries, indexes, filters, conversations, and reassembly.

```text
PacketSummary
  key
  timestamp_ns
  interface_id
  captured_length
  wire_length
  link_type
  capture_flags
  parse_condition
  protocol_path[]
  selected_typed_columns[]
  analysis_revision
```

A hot summary does not contain the complete field tree, raw bytes, repeated field names, or presentation labels.

## Selected Packet Contract

Selecting a packet returns its parsed tree and complete captured bytes atomically:

```text
SelectedPacketView
  key
  metadata
  registry_generation
  analysis_revision
  nodes[]
  data_sources[]
  packet_references[]
  diagnostics[]
  reassembly_status
```

Data source zero is always the selected captured frame and contains exactly `captured_length` bytes. Reassembled, decrypted, decompressed, and other derived bytes are separate sources.

Every non-generated field node identifies:

```text
field_id
parent_node_index
data_source_id
offset
length
value_tag
typed_value
flags
```

Offsets are relative to the declared data source, never implicitly relative to the selected frame. This allows a protocol tree attached to `Reassembled TCP` to coexist with the selected segment's raw-byte view.

Repeated fields are represented by repeated ordered occurrences. They must not be collapsed into a `field_id -> value` map.

Phase 2 stores nodes, data sources, contributors, strings, values, and source bytes in contiguous vectors and shared arenas. `ParsedFieldNode`, `ParsedDataSource`, and `ParsedContributor` are trivially copyable; field occurrences never own labels or strings. Source zero is the only `Captured` source. Every later source is `Derived`, and contributors retain complete `PacketKey` values.

## Packet References

Relationships between captured packets are typed rather than embedded only in display labels:

```text
PacketReference
  kind: fragment | segment | reassembled_in | continuation_to | pdu_first | pdu_last
  target: PacketKey
```

The frontend renders and navigates these references. It never searches for fragments or TCP segments itself.

## Link-Type Extensibility

Root protocol selection uses an extensible `u32 DLT -> dissector` registry. The currently accepted Ethernet, Linux cooked, RAW, NULL, and LOOP link types are the initial registrations, not a closed parser enum.

An unregistered link type produces a partial `UnsupportedLinkType` result while preserving packet metadata and bytes. Adding another link type must not require changes to higher-layer dissectors.

## Resource Bounds

All parser stages must have explicit limits for nesting, dissector calls, fields, diagnostics, strings, reassembly bytes, fragments, flow state, output batches, and client queues. Hitting a limit produces a partial `ResourceLimit` result and metrics instead of terminating the capture.

The Phase 2 `ParseBudget` defaults are 65,536 nodes, depth 256, 64 data sources, 4,096 contributors, 1 MiB of UTF-8 strings, 16 MiB of value bytes, 64 MiB of source bytes, and a 128 MiB encoded message. Builders check limits and integer conversions before mutation. Budget rejection leaves a structurally valid partial tree.

## Packet Tree Wire Format

The production packet-tree schema is `packages/core/cpp/schemas/packet_tree.fbs`, file identifier `PRT2`, format version 1. It carries one `PacketKey`, registry revision, parse condition, vectors of fixed structs, and separate string/value/source arenas.

The C++ trust boundary runs the generated FlatBuffers verifier, then validates version, kind, revision, enums, registry field IDs, parent ordering, depth, source IDs, contributors, UTF-8, arena slices, and all configured budgets. `VerifiedPacketTreeView` borrows the encoded buffer and traverses it without unpacking a tree.

The TypeScript trust boundary performs bounded FlatBuffers table/vector validation before invoking generated accessors. `PacketTreeReader` accepts `ArrayBuffer` or exclusively owned `Uint8Array`, preserves nonzero byte offsets, validates the same semantic indexes and budgets, and exposes lazy indexed access plus zero-copy byte slices. `SharedArrayBuffer` is rejected. The input buffer must outlive the reader and all returned byte views, and ownership must not mutate it after verification. Worker transfers provide this exclusive-ownership boundary without a copy.
