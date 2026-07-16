# Dissector Architecture

This document defines the internal C++ structure for built-in packet
dissectors. It complements `parser-architecture.md`, which owns the parser's
data and runtime contracts.

## Directory Structure

```text
packages/core/cpp/src/parsing/
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
    shared/
    link/
    network/
    transport/
    application/
    tunnel/
  dissector_catalog.cpp/.hpp
  dissector_context.cpp/.hpp
  packet_parser.cpp/.hpp
  registry.cpp
```

Each protocol normally has one internal header/source pair. A tightly coupled
suite may share one pair when separating it would obscure the protocol, as
with STP/RSTP/MSTP or DNS/mDNS/LLMNR.

Family ownership is:

- `link`: Frame, Ethernet payload handling, VLAN, SLL/SLL2, NULL/LOOP, RAW,
  LLC, SNAP, LLDP, and STP/RSTP/MSTP.
- `network`: ARP/RARP/InARP, IPv4, IPv6, ICMP extensions, ICMPv4, ICMPv6,
  IGMP, and MLD.
- `transport`: TCP and UDP.
- `application`: DNS/mDNS/LLMNR, DHCPv4, DHCPv6, NTP, HTTP, TLS, and QUIC.
- `tunnel`: GRE, VXLAN/VXLAN-GPE, Geneve, and MPLS.
- `shared`: helpers used by multiple families. Do not place single-protocol
  conveniences here.

`core_link_types.*` remains under `src/parsing` because capture configuration
and parser dispatch both consume it.

## Dissector Responsibilities

A dissector implementation:

- validates captured and reported boundaries before reading;
- emits fields through `DissectorContext`;
- marks partial, malformed, or resource-limited results through the context;
- dispatches children through typed catalog selectors;
- preserves unsupported bytes through `unknown.data`;
- performs no registry string lookup on the packet path;
- does not own global or capture lifecycle state.

Parent dissectors know selector domains, not child implementations. Ethernet,
for example, dispatches an EtherType and never calls IPv4 directly.

## State Ownership

Resolved `FieldId` values and immutable protocol options live in the
corresponding dissector's internal header:

```text
dissectors/transport/tcp_dissector.hpp
  TcpDissectorState
  dissect_tcp(...)
```

Do not recreate a centralized state header. A shared state type is justified
only when independent dissectors genuinely consume the same structure.

The catalog registrar creates or accepts each immutable state owner. The
top-level catalog retains that owner for as long as its function-pointer
handle can be dispatched.

## Catalog Construction

`DissectorCatalog` owns:

- the immutable registry snapshot;
- state and function-pointer handle lifetimes;
- direct and sparse selector tables;
- special root, Ethernet, LLC, and SNAP handles;
- duplicate-registration validation;
- immutable lookup methods used by `DissectorContext`.

Its constructor explicitly performs:

```text
register_core_catalog
register_link_catalog
register_network_catalog
register_transport_catalog
register_application_catalog
register_tunnel_catalog
```

`CatalogRegistrar` is the focused construction interface. It resolves fields,
owns states, adds handles, assigns special handles, and binds selectors.
Field resolution happens only during catalog construction.

The only current cross-family bundle is `LinkCatalogHandles`, which passes the
Ethernet handle to the tunnel catalog for GRE transparent Ethernet bridging.
Add another handle only when a real cross-family selector requires it. Do not
pass the whole catalog or mutable tables between sections.

## Selector Registration

Use the registrar method matching the protocol's dispatch domain:

- `bind_dlt`
- `bind_ethertype`
- `bind_ip_protocol`
- `bind_sll_protocol`
- `bind_null_family`
- `bind_llc_sap`
- `bind_snap_pid`
- `bind_udp_port`
- `bind_tcp_port`

Duplicate selectors are construction errors. Unsupported selectors must keep
the existing bounded unknown-data fallback. Do not add global constructors,
static self-registration, linker registration, or unordered initialization.

## Registry Identity

`registry.cpp` contains one intentionally global append-only identity ledger.
The current built-in snapshot contains 38 protocols and 649 fields.

To preserve existing IDs:

1. Append a new protocol descriptor to the protocol array.
2. Append new field descriptors to the end of the field array.
3. For fields added to an existing protocol, still append them at the end.
4. Never reorder, regroup, or insert among existing descriptors.
5. Update the expected count and revision tests intentionally.
6. Keep representative existing protocol and field ID assertions unchanged.

The registry revision changes when descriptors change. Catalog organization
does not change registry identity.

## Adding a New Dissector

1. Choose the owning family.
2. Add the protocol's internal `.hpp` and `.cpp` files.
3. Keep its immutable state beside the dissector declaration.
4. Append registry protocol and field descriptors without reordering existing
   entries.
5. Add construction and selector binding to the matching catalog section.
6. Extend a small cross-family handle bundle only when unavoidable.
7. Add the source file to the matching family block in
   `packages/core/cpp/CMakeLists.txt`.
8. Add focused protocol tests.
9. Extend catalog selector coverage when a selector is added.
10. Run the validation checklist below.

## Required Tests

Protocol tests remain the primary semantic coverage. Each new parser path
should cover:

- valid dispatch and expected protocol path;
- capture truncation producing `Partial`;
- impossible lengths or declarations producing `Malformed`;
- unsupported or trailing bytes preserved as source-backed unknown data;
- resource budgets producing a valid `ResourceLimit` prefix;
- nested dispatch limits where the protocol can recurse;
- derived-source provenance when reassembly is involved.

Catalog tests cover selector presence, special handles, incomplete registries,
invalid handles, and duplicate registrations. They should not duplicate every
protocol tree assertion.

Before completion, run:

```bash
pnpm test:cpp
```

Also run the parser allocation test, standalone fuzz-harness smoke tests, and
the Release parser benchmark. Warm parsing must remain allocation-free. An
unexplained regression greater than 5% in packets per second or nodes per
second is not acceptable.

## Common Mistakes

- Adding field lookup by string inside a dissector.
- Calling a child dissector directly instead of using a selector.
- Inserting registry descriptors among existing entries.
- Putting unrelated protocols into one family implementation file.
- Creating a new mega-header for state structures.
- Moving single-use helpers into `shared`.
- Silently changing unknown, truncation, malformed, or resource-limit
  behavior during a structural refactor.
- Adding mutable global registration or relying on initialization order.
- Measuring packet rate without checking node rate when tree shape changes.

## Review Checklist

- [ ] Family and file ownership are clear.
- [ ] State is immutable and local to the protocol header.
- [ ] Registry descriptors are appended only.
- [ ] Catalog registration is in the correct family section.
- [ ] Selector duplicates still fail.
- [ ] Parent protocols remain decoupled from child implementations.
- [ ] Unknown bytes and parse conditions are preserved.
- [ ] CMake contains the new source in the correct family block.
- [ ] Semantic, truncation, malformed, unknown-data, and budget tests pass.
- [ ] Warm parser allocation count remains zero.
- [ ] Fuzz smoke tests and the Release benchmark pass.
- [ ] Documentation and coverage are updated.
