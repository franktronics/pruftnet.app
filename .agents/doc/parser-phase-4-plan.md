# Parser Phase 4 Plan: Extensible Dissector Architecture

Status: implemented and validated on 2026-07-11 after Phase 3 commit `ba95126`.

Implementation result: the parser now uses an immutable numeric dissector catalog and separate frame, Ethernet, VLAN, IPv4, UDP, and TCP modules. The unchanged 47-byte UDP fixture retains its exact 27-node shape, the warmed parser remains allocation-free, 22 CTest cases and 9 Vitest cases pass, and the Release build with supported interprocedural optimization sustains approximately 1.64 million parses/s and 752,000 parse + encode + verify + traversal operations/s.

## Goal

Replace the protocol-specific control flow in `packet_parser.cpp` with an immutable, allocation-free dissector catalog. Each protocol owns its descriptors, resolved field IDs, parsing logic, and dispatch registrations in a separate module. `PacketParser` only creates a bounded parse session, selects the root dissector, and finalizes the tree.

The phase must prove that adding a protocol does not require editing parent dissectors or `PacketParser`. VLAN and TCP are the first new protocols used to validate that property.

## Architectural Rules

- Keep protocol implementations under `src/parsing/dissectors/`, with one header/source pair per protocol or tightly coupled protocol family.
- Do not use a C++ virtual class hierarchy, RTTI, or packet-path heap allocation.
- Represent a dissector handle as a function pointer plus immutable protocol state containing its resolved IDs.
- Build and validate all descriptors, handles, and dispatch entries before the capture starts.
- Freeze the metadata registry and dissector catalog together. Neither may mutate during a capture.
- Dispatch by numeric selector only. Packet parsing must not perform string lookups.
- Enforce depth and dissector-call budgets in the central dispatcher, not independently in protocol implementations.
- Keep malformed, partial, unknown, and resource-limit behavior centralized and identical across dissectors.
- Keep the catalog internal in this phase. A stable external plugin ABI, dynamic loading, and hot reload require a separate design.

## Core Types

Introduce internal equivalents of:

```text
DissectorContext
  bounded tree operations
  condition and diagnostic operations
  central dispatch operations
  remaining call/depth budget

DissectorHandle
  function pointer
  immutable protocol state pointer

DissectorCatalog
  RegistrySnapshotPtr
  immutable numeric dispatch tables
  owned immutable protocol states
```

Protocol code receives only a bounded `PacketView`, parent node index, `DissectorContext`, and its immutable state. It must not own the parser, catalog, tree, packet bytes, or capture lifecycle.

The common context exposes safe operations for protocol nodes, unsigned values, source-backed bytes, unknown ranges, child views, conditions, and child dispatch. It must preserve the current prefix-finalization behavior on budget exhaustion.

## Dispatch Tables

Provide separate typed tables so selector domains cannot be mixed accidentally:

- `u32 DLT -> DissectorHandle` for root link-layer selection.
- `u16 EtherType -> DissectorHandle` for Ethernet and VLAN payloads.
- `u8 IPv4 protocol -> DissectorHandle` for IPv4 payloads.

Use fixed-size direct tables where the domain is naturally bounded and memory cost is reasonable. DLT registration uses a sorted immutable vector because its 32-bit domain is sparse. Core construction uses one deterministic binding for each selector and rejects a missing or incompatible registry before capture startup. A general mutable plugin-facing catalog builder remains out of scope with the external plugin ABI.

Unknown selectors remain successful bounded fallbacks: preserve the child bytes under `unknown.data` and do not abort packet processing.

TCP/UDP port and heuristic application dispatch are not added until application dissectors are implemented. Their future APIs must be layered on the same catalog rather than embedded in TCP or UDP.

## Registration Lifecycle

1. Create the deterministic core registry builder.
2. Register shared root, unknown, and diagnostics descriptors.
3. Register each built-in dissector's protocol and fields in deterministic append-only order.
4. Bind module functions and immutable resolved-ID states to numeric selectors.
5. Freeze the metadata registry, resolve module state, and reject missing fields or invalid handles.
6. Construct one matching catalog whose registration methods are private and unavailable after startup.
7. Share the immutable catalog between parser instances for the capture lifetime.

Registration order remains deterministic so a given built-in set produces a stable registry revision. Tests must not depend on numeric IDs without also asserting the matching revision.

## Protocol Modules

Migrate existing logic without changing packet-tree behavior:

- `frame_dissector`: root metadata and DLT dispatch.
- `ethernet_dissector`: Ethernet type/length parsing and EtherType dispatch.
- `ipv4_dissector`: IPv4 fields, options, boundaries, fragmentation fallback, and IP protocol dispatch.
- `udp_dissector`: UDP header, declared length, payload, and trailing bytes.

Add protocols that exercise both extension paths:

- `vlan_dissector`: IEEE 802.1Q/802.1ad tag fields and recursive EtherType dispatch, with an explicit maximum tag depth enforced by the central budget.
- `tcp_dissector`: bounded TCP base header, data offset, flags, window, checksum, urgent pointer, raw options, and payload. TCP stream tracking, option sub-dissectors, reassembly, and application dispatch remain later work.

Ethernet must not name or call IPv4 or VLAN directly. IPv4 must not name or call UDP or TCP directly. They dispatch only through typed selector tables.

## File Structure

Target structure:

```text
src/parsing/
  packet_parser.cpp
  packet_parser.hpp
  dissector.hpp
  dissector_context.cpp
  dissector_context.hpp
  dissector_catalog.cpp
  dissector_catalog.hpp
  catalog/
    catalog_registrar.cpp/.hpp
    catalog_sections.hpp
    core_catalog.cpp
    link_catalog.cpp
    network_catalog.cpp
    transport_catalog.cpp
    application_catalog.cpp
    tunnel_catalog.cpp
  dissectors/
    link/
      frame_dissector.cpp
      ethernet_dissector.cpp
      vlan_dissector.cpp
    network/
      ipv4_dissector.cpp
    transport/
      udp_dissector.cpp
      tcp_dissector.cpp
```

Keep public headers limited to stable parsing data contracts. Catalog and dissector implementation details remain internal until plugin requirements are specified.
The maintained current architecture is documented in
[`dissector-architecture.md`](dissector-architecture.md).

## Implementation Steps

1. Extract `ParseSession` into a bounded internal `DissectorContext` without changing its semantics.
2. Implement typed immutable dispatch tables, duplicate-registration errors, and central call/depth accounting.
3. Build a deterministic core catalog that owns the registry snapshot and protocol states.
4. Move frame, Ethernet, IPv4, and UDP logic into separate dissector modules.
5. Replace direct `parse_ipv4` and `parse_udp` calls with catalog dispatch.
6. Add VLAN and TCP descriptors, modules, and selector registrations.
7. Keep unknown payload preservation and all existing Phase 3 trees byte-for-byte compatible where protocol behavior did not change.
8. Extend fuzzing so arbitrary catalog dispatch paths and nested VLAN tags exercise the common context.
9. Re-run allocation and Release benchmarks against the Phase 3 baseline.

## Tests

- Catalog construction succeeds for the complete built-in set.
- Duplicate protocol keys, field keys, and selectors fail deterministically.
- Missing root dissectors and invalid handles fail before capture startup.
- Catalog tests verify every built-in typed dispatch path without involving `PacketParser` or parent dissectors.
- Existing Ethernet/IPv4/UDP golden trees remain unchanged.
- Ethernet dispatches IPv4 through EtherType `0x0800`.
- Ethernet dispatches one or nested VLAN tags through `0x8100` and `0x88a8`.
- VLAN dispatches its encapsulated EtherType through the same table as Ethernet.
- IPv4 dispatches UDP through protocol 17 and TCP through protocol 6.
- Unknown DLT, EtherType, and IP protocol values preserve all available bytes.
- TCP covers minimum headers, options, invalid data offsets, truncation at every boundary, and payloads.
- Depth and dissector-call limits return a finalized `ResourceLimit` prefix.
- Parser fuzzing covers bytes, lengths, selectors, budgets, and nested dispatch without exception escape or out-of-bounds access.
- ASan and UBSan pass for parser, catalog, VLAN, and TCP targets.

## Performance Gate

- Preserve zero parser allocations per packet after warm-up.
- Compare the unchanged 47-byte Ethernet/IPv4/UDP fixture with the Phase 3 parse-only baseline of approximately 1.43 million packets/s.
- Investigate a parse-only regression above 5% before completing the phase.
- Benchmark known-selector and unknown-selector dispatch independently.
- Add VLAN/IPv4/TCP fixtures and a mixed-protocol corpus; report parse-only and parse + encode + verify + traversal throughput.
- Keep dispatch lookup constant-time for EtherType and IPv4 protocol selectors.

## Out of Scope

- Dynamic shared-library loading and unloading.
- A stable C or C++ plugin ABI.
- Lua dissectors.
- Runtime catalog mutation or plugin hot reload.
- IPv6, ARP, ICMP, DNS, TLS, and other protocol implementations beyond VLAN and the bounded TCP slice.
- TCP stream state, reassembly, retransmission analysis, conversations, and application dispatch.
- Checksum verdicts and offload-aware validation.

## Exit Criteria

- Adding a built-in protocol requires a new module and catalog registration, not edits to `PacketParser` or parent dissectors.
- Existing Phase 3 parsing behavior remains compatible.
- VLAN and TCP demonstrate recursive and sibling dispatch paths.
- Registry and catalog snapshots are immutable, matching, and safely shared.
- All packet-controlled failures remain bounded and non-throwing.
- CTest, Vitest, lint, frozen install, fuzz smoke tests, sanitizers, and `git diff --check` pass.
- The warmed-up parser remains allocation-free and stays within the defined performance regression gate.
