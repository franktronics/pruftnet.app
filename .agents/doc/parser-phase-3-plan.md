# Parser Phase 3 Plan: Ethernet II to IPv4 to UDP

## Goal

Replace the placeholder parser with the first production vertical slice: captured Ethernet II frames produce bounded `ParsedPacketTree` values, dispatch into IPv4 and UDP when supported, preserve unknown payloads, and remain safe for every captured/reported-length combination.

The phase ends after the real parser is integrated into `SnifferRuntime`, its trees round-trip through the Phase 2 codec in C++ and TypeScript, and release benchmarks establish the first parse-through-codec baseline.

## Protocol Ground Truth

- Ethernet behavior follows Wireshark's `packet-eth.c`: destination and source are six bytes, the type/length word is big-endian, values up to 1500 represent IEEE 802.3 length rather than EtherType, and Ethernet II starts at 1536.
- IPv4 behavior follows RFC 791 and Wireshark's `packet-ip.c`: version must be 4, IHL is measured in 32-bit words with a minimum of 5, and total length cannot be less than the header length.
- UDP behavior follows RFC 768 and Wireshark's `packet-udp.c`: the header is eight bytes and the declared length includes that header and must be at least eight bytes.

## Scope

### Registry

Extend `make_core_registry()` in one deterministic append-only order with protocols and fields for:

- Frame: captured length, reported length, link type, and frame payload.
- Ethernet II: destination, source, type/length, EtherType, and payload.
- IPv4: version, header length, DSCP/ECN byte, total length, identification, flags, fragment offset, TTL, protocol, checksum, source, destination, options, and payload.
- UDP: source port, destination port, length, checksum, payload, and trailing IP bytes when the UDP length is shorter than the containing IPv4 payload.
- Diagnostics and unknown bytes reuse the existing core fields where their value types fit; add fields only when the semantic value differs.

Keep IDs runtime-assigned and compare keys or fixture-owned IDs in tests. Update the golden registry revision intentionally.

### Parser Architecture

- Replace `EmptyPacketParser` with an internal `PacketParser` that owns a `RegistrySnapshotPtr` and `ParseBudget` and emits a finalized `ParsedPacketTree` for every valid `PacketKey`.
- Give protocol dissectors a small internal context containing the bounded `PacketView`, tree builder, parent node, and resolved field IDs. Keep dispatch iterative and explicit for this slice; do not introduce a plugin ABI before a second independent dissector family demonstrates the required abstraction.
- Change the callback payload so `ParsedPacket` owns the tree or replace the placeholder status/string structure with the tree directly. The callback receives a borrowed reference valid only for the callback invocation.
- Keep parser failures in the tree's `ParseCondition` and diagnostic nodes. Reserve thrown exceptions for programmer errors; packet bytes and budget exhaustion must produce typed, bounded results.

### Boundary Semantics

- Add the captured bytes as data source zero. Root and field ranges refer only to captured bytes; reported lengths are represented as scalar metadata.
- Distinguish capture truncation from malformed declarations. A read inside the reported/contained range but outside captured bytes is `Truncated`. A protocol length outside its parent-reported boundary or smaller than its mandatory header is `Malformed`.
- Preserve all bytes not claimed by a supported child protocol under an unknown/payload node. Unsupported link types, IEEE 802.3 frames, unknown EtherTypes, unknown IPv4 protocols, VLAN-tagged frames, and fragmented IPv4 datagrams remain inspectable instead of being discarded.
- Do not descend into UDP when either IPv4 `MF` is set or the fragment offset is nonzero. Reassembly is a later phase.
- Descend into IPv4 only for Ethernet EtherType `0x0800`, and into UDP only for IPv4 protocol 17.
- If UDP length is less than the IPv4 payload, bound UDP to its declared length and expose the remaining IP bytes separately. If it exceeds the IPv4 payload, mark malformed and stop UDP payload traversal.
- Stop cleanly on the first budget error, retain the already-built prefix, set `ResourceLimit`, and finalize the tree.

### Checksum Policy

Expose IPv4 and UDP checksum fields but do not classify checksum validity in this phase. Capture offload can make on-wire checksum validation misleading, and the runtime does not yet carry the metadata needed to distinguish offloaded packets. Add checksum validation only with explicit offload-aware semantics.

## Implementation Steps

1. Add stable core registry descriptors and a resolved-ID bundle built once from the immutable snapshot.
2. Implement Ethernet II parsing over `PacketView`, including type/length classification and unknown fallback.
3. Implement IPv4 header, option, total-length, and fragmentation handling with strict parent boundaries.
4. Implement UDP header and payload handling with declared-length containment.
5. Replace the placeholder runtime parser and return real parsed trees through `PacketCallback` without adding a second packet-byte copy outside the tree's owned source arena.
6. Add a real Ethernet/IPv4/UDP cross-language fixture and verify exact field values, hierarchy, byte slices, registry revision, and checksum parity in C++ and Vitest.
7. Re-run and document parse, encode, verify, and traversal benchmarks in a clean Release build.

## Tests

- Exact golden tree for an Ethernet II/IPv4/UDP datagram with payload.
- Zero-length UDP payload and UDP length shorter than the IPv4 payload.
- Unknown link type, IEEE 802.3 type/length, unknown EtherType, unknown IPv4 protocol, VLAN EtherType, and fragmented IPv4 fallback.
- IPv4 options, invalid version, IHL below 5, IHL beyond capture, total length below IHL, and total length beyond parent.
- UDP length below 8 and beyond the IPv4 payload.
- Truncation at every byte boundary of representative Ethernet, IPv4, and UDP packets, including `captured_length < reported_length`.
- Budget exhaustion for nodes, depth, source bytes, value bytes, strings, contributors, and encoded bytes.
- Runtime offline-PCAP integration asserting identity, ordering, real tree content, and callback lifetime.
- Coverage-guided parser fuzz target varying bytes, captured length, reported length, link type, and budget; sanitizer runs must produce no crash, exception escape, or out-of-bounds access.
- C++ codec and Vitest round-trip against the same real fixture.

## Performance Gate

- Measure parse-only and parse + encode + verify + full traversal for minimum-size UDP frames and a realistic mixed-size corpus.
- Use a reusable parser/encoder and report allocations per packet after warm-up.
- Keep the Phase 2 codec-only reference visible: 624-byte synthetic tree at approximately 2.03 million encode + verify + traversal operations/s on the Apple M1 Pro Release environment.
- Investigate any codec-only regression above 5%. Establish, rather than guess, the first parse throughput target from the real fixture and retain it as the Phase 4 regression baseline.

## Out of Scope

- IEEE 802.3/LLC dissection, VLAN tag traversal, IPv6, TCP, IPv4 reassembly, application dispatch, name resolution, checksum verdicts, plugin loading, UI rendering, and RPC transport.

## Exit Criteria

- All malformed and truncated fixtures return bounded trees with the expected condition.
- Unknown protocols preserve bytes and never abort capture processing.
- Runtime callbacks carry real parsed trees with stable registry revisions and packet identities.
- CTest, Vitest, lint, frozen install, fuzz smoke runs, sanitizers, and `git diff --check` pass.
- Release benchmark results and allocation counts are documented.
- No blocker, high, or medium correctness/security findings remain after review.
