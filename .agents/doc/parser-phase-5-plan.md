# Parser Phase 5 Plan: Dual-Stack Network and Control-Plane Coverage

Status: implemented and validated on 2026-07-11 after Phase 4 commit `1173a7e`.

Implementation result: ARP, IPv6, bounded extension traversal, ICMPv4, ICMPv6, and Neighbor Discovery now use the immutable dissector catalog. IPv4 and IPv6 share family-qualified IANA protocol-number dispatch, existing IDs 1 through 48 and the 27-node UDP fixture remain stable, 23 CTest cases and 9 Vitest cases pass, and ASan/UBSan plus parser/codec fuzz smoke tests pass. The Release build sustains approximately 1.67 million parses/s for the Phase 4 IPv4/UDP fixture, 751,000 full pipeline operations/s, and 1.65 million parses/s for the mixed Phase 5 corpus with zero warmed parser allocations.

## Goal

Extend the allocation-free dissector architecture from IPv4 transport traffic to foundational dual-stack and control-plane traffic. Phase 5 adds ARP, IPv6, bounded IPv6 extension-header traversal, ICMPv4, and a bounded ICMPv6/Neighbor Discovery slice while preserving unknown bytes and refusing unbounded or stateful work.

The phase targets protocols required for ordinary LAN visibility, reachability analysis, and future topology mapping. It does not introduce application dispatch, fragment reassembly, stream state, checksum verdicts, or active packet generation.

## Why This Phase Comes Next

- Modern captures remain opaque for EtherTypes `0x0806` (ARP) and `0x86dd` (IPv6).
- IPv4 protocol 1 and IPv6 next header 58 currently fall back to unknown bytes.
- ARP and ICMPv6 Neighbor Discovery provide the address and router relationships needed by future topology features.
- All selected protocols fit the existing stateless per-packet model.
- DNS needs an application claim/port-dispatch contract that does not exist yet.
- Reassembly needs capture-scoped retention, revisions, references, provenance, and eviction policies that do not exist yet.

## Protocol Ground Truth

- ARP follows RFC 826 and Wireshark `packet-arp.c`.
- IPv6 base and extension headers follow RFC 8200 and Wireshark `packet-ipv6.c`.
- ICMPv4 follows RFC 792, RFC 1191 where applicable, and Wireshark `packet-icmp.c`.
- ICMPv6 follows RFC 4443 and Wireshark `packet-icmpv6.c`.
- Neighbor Discovery follows RFC 4861. Prefix information used by SLAAC follows RFC 4862.
- Multipart ICMP length fields follow RFC 4884, but extension-object dissection remains out of scope.

## Architecture

### Shared IP Dispatch

Rename the IPv4-specific dispatch domain to the shared IANA protocol-number domain:

```text
u8 IP protocol / IPv6 next header -> DissectorHandle
```

Required API changes:

- `ipv4_protocol()` becomes `ip_protocol()`.
- `bind_ipv4_protocol()` becomes `bind_ip_protocol()`.
- `dispatch_ipv4_protocol()` becomes `dispatch_ip_protocol()`.
- IPv4 and IPv6 both dispatch TCP, UDP, and control protocols through this table.

Parent dissectors must not name or directly call child protocol implementations. IPv6 extension headers may dispatch the next selector through the same table, but context restrictions must prevent IPv6-only extension headers from being treated as valid IPv4 payloads.

### Bounded Variable-Length Parsing

Add small internal checked helpers for repeated TLV and extension parsing:

- checked offset addition;
- checked unit-to-byte multiplication;
- remaining-length calculation;
- mandatory progress validation;
- captured versus reported boundary classification.

General policy:

- Required bytes inside the reported boundary but outside capture produce `Partial`.
- A declaration beyond its parent-reported boundary produces `Malformed`.
- A zero-length TLV that cannot advance produces `Malformed`.
- An unknown but structurally valid type remains `Complete` and preserves raw bytes.
- Resource exhaustion produces a finalized `ResourceLimit` prefix and stops all mutation.

### Registry Compatibility

Append new protocols and fields after the existing Phase 4 descriptors. IDs 1 through 48 must not change. The core registry revision changes intentionally and the cross-language fixture must assert the new revision while retaining the exact existing UDP tree shape.

## ARP Dissector

Register EtherType `0x0806`.

Parse the generic RFC 826 envelope rather than hard-coding Ethernet/IPv4 lengths:

```text
hardware type: 2 bytes
protocol type: 2 bytes
hardware address length: 1 byte
protocol address length: 1 byte
operation: 2 bytes
sender hardware address: hlen bytes
sender protocol address: plen bytes
target hardware address: hlen bytes
target protocol address: plen bytes
```

The logical ARP size is `8 + 2 * hlen + 2 * plen`, calculated with checked arithmetic. Addresses remain source-backed bytes. Unknown hardware types, protocol types, operations, and structurally valid address lengths are not malformed.

Ethernet padding after the calculated ARP length remains a sibling unknown range under Ethernet, not part of the ARP node.

Required common coverage:

- Ethernet/IPv4 request, operation 1.
- Ethernet/IPv4 reply, operation 2.
- Generic variable address lengths.
- Unknown operation fallback.

RARP and hardware-specific presentation are deferred.

## IPv6 Dissector

Register EtherType `0x86dd`.

Parse the fixed 40-byte header:

- version;
- traffic class;
- flow label;
- payload length;
- next header;
- hop limit;
- 16-byte source address;
- 16-byte destination address.

Rules:

- Version must be 6.
- Declared IPv6 size is `40 + payload_length`.
- A declared size beyond the Ethernet/VLAN reported boundary is malformed.
- Missing captured bytes within a valid declaration are partial.
- Bytes beyond the declared IPv6 end remain parent-level unknown trailing bytes.
- IPv6 addresses remain canonical 16-byte fields; the parser does not allocate formatted strings.
- Payload length zero is accepted as a zero-length payload only when semantically valid without a jumbogram. Jumbograms are unsupported and remaining bytes are not guessed into the payload.

## IPv6 Extension Headers

Support bounded traversal in wire order for:

- Hop-by-Hop Options, next header 0;
- Routing Header, next header 43;
- Fragment Header, next header 44;
- Authentication Header, next header 51, structural length only;
- No Next Header, next header 59;
- Destination Options, next header 60.

ESP, next header 50, is terminal opaque payload.

Length rules:

- Hop-by-Hop, Routing, and Destination Options: `(HdrExtLen + 1) * 8`.
- Fragment: exactly 8 bytes.
- Authentication Header: `(PayloadLen + 2) * 4`, minimum 12 bytes.
- No Next Header: zero bytes and no child dispatch.

Every traversal step must consume a positive number of bytes and stay within the IPv6-declared payload. Existing central call/depth budgets remain authoritative; no separate unbounded loop is allowed. Hop-by-Hop appearing anywhere except immediately after the IPv6 base header is malformed. Other unusual but structurally valid orders remain visible without inventing endpoint behavior.

Option-bearing headers expose their option area as raw source-backed bytes. Detailed IPv6 option TLVs, Jumbo Payload, routing-type-specific bodies, AH authentication, and ESP decryption are deferred.

### Fragment Policy

Expose:

- next header;
- encoded fragment offset and byte offset;
- reserved bits;
- M flag;
- identification.

Without reassembly:

- Atomic fragment (`offset = 0`, `M = 0`) may continue dispatch.
- First fragment (`offset = 0`, `M = 1`) preserves remaining fragment bytes as unknown and does not claim a complete upper-layer PDU.
- Non-initial fragments preserve remaining bytes as unknown and never dispatch their advertised next header.
- A fragment with `M = 1` and fragment data length not divisible by eight is malformed.
- No fragment payload is checksum-validated.

## ICMPv4 Dissector

Register IP protocol number 1.

Every message exposes the four-byte common header:

- type;
- code;
- checksum.

Add typed bodies for:

- Echo Reply, type 0;
- Destination Unreachable, type 3;
- Echo Request, type 8;
- Time Exceeded, type 11;
- Parameter Problem, type 12;
- Redirect, type 5.

Echo messages expose identifier, sequence, and source-backed payload. Error messages expose their fixed type-specific word and quoted packet bytes. Destination Unreachable code 4 exposes the Next-Hop MTU. Quoted IPv4 packets are not recursively dissected in this phase.

Unknown types and codes preserve numeric values and raw bodies. A known body shorter than its required reported minimum is malformed; capture truncation inside an otherwise valid boundary is partial.

Checksum values are exposed but not classified.

## ICMPv6 Dissector

Register IP next header 58.

Every message exposes:

- type;
- code;
- checksum;
- error/informational classification derived from the type.

Add typed bodies for:

- Destination Unreachable, type 1;
- Packet Too Big, type 2;
- Time Exceeded, type 3;
- Parameter Problem, type 4;
- Echo Request, type 128;
- Echo Reply, type 129;
- Router Solicitation, type 133;
- Router Advertisement, type 134;
- Neighbor Solicitation, type 135;
- Neighbor Advertisement, type 136;
- Redirect, type 137.

ICMPv6 error messages preserve quoted packet bytes without recursive dissection. Packet Too Big exposes MTU; Parameter Problem exposes pointer. Echo exposes identifier, sequence, and payload.

Checksum values are exposed but not classified because validation requires the IPv6 pseudo-header, complete capture, fragment state, and explicit offload policy.

## Neighbor Discovery Options

Parse repeated ordered ND options for Router Solicitation, Router Advertisement, Neighbor Solicitation, Neighbor Advertisement, and Redirect.

Required options:

- Source Link-Layer Address, type 1;
- Target Link-Layer Address, type 2;
- Prefix Information, type 3;
- Redirected Header, type 4;
- MTU, type 5.

ND option length is expressed in 8-byte units. A zero length is malformed and stops traversal. Every option must fit inside the ICMPv6 message. Unknown options receive a protocol option node with type, declared length, and source-backed body so no bytes disappear.

Prefix Information exposes prefix length, L/A flags, valid lifetime, preferred lifetime, and 16-byte prefix. Router Advertisement exposes current hop limit, M/O flags, router lifetime, reachable time, and retransmission timer. Neighbor messages expose target addresses and advertisement flags.

SEND, MLD, RPL, Mobile IPv6, SLAAC state mutation, duplicate-address detection, and topology graph construction are deferred.

## Implementation Steps

1. Generalize catalog/context APIs from IPv4 protocol dispatch to shared IP protocol dispatch.
2. Add checked helpers for variable-length headers and TLVs.
3. Append deterministic ARP, IPv6, IPv6-extension, ICMPv4, ICMPv6, and ND descriptors.
4. Implement ARP and Ethernet padding ownership.
5. Implement the IPv6 base header and unknown/no-next behavior.
6. Implement bounded extension-header modules and fragment policy.
7. Implement ICMPv4 common and selected typed bodies.
8. Implement ICMPv6 common, errors, echo, and selected ND messages.
9. Implement bounded repeated ND options.
10. Add protocol-specific unit files, mixed PCAP coverage, fuzz seeds, allocation checks, and benchmarks.
11. Update parser, capture, registry, and benchmark documentation.

## Target File Structure

```text
src/parsing/dissectors/
  arp_dissector.cpp/.hpp
  ipv6_dissector.cpp/.hpp
  ipv6_extension_dissector.cpp/.hpp
  icmpv4_dissector.cpp/.hpp
  icmpv6_dissector.cpp/.hpp
```

Protocol-specific tests should move into dedicated files instead of continuing to grow `packet_parser_tests.cpp`:

```text
tests/unit/
  arp_dissector_tests.cpp
  ipv6_dissector_tests.cpp
  icmp_dissector_tests.cpp
```

## Tests

### Compatibility

- Existing Ethernet/IPv4/UDP golden tree remains exactly 27 nodes.
- Existing VLAN/TCP behavior and field IDs remain unchanged.
- Registry revision changes intentionally; existing descriptor IDs do not.
- C++ codec and TypeScript reader continue to accept the same schema version.

### ARP

- Ethernet/IPv4 request and reply.
- Generic variable address lengths.
- Unknown operation.
- Truncation at every byte boundary.
- Calculated body beyond reported parent boundary.
- Ethernet padding remains outside ARP.

### IPv6

- Direct TCP, UDP, ICMPv6, unknown next header, and No Next Header.
- One and multiple supported extension headers.
- Invalid extension lengths and truncated extension boundaries.
- Hop-by-Hop in an invalid position.
- Chain exhaustion through central call/depth budgets.
- Declared payload shorter and longer than available Ethernet payload.
- Unsupported jumbogram policy.
- Atomic, first, and non-initial fragment behavior.
- Misaligned non-final fragment payload.

### ICMP

- Every selected ICMPv4 and ICMPv6 type.
- Echo payloads and zero-length payloads.
- Error fixed fields and quoted data.
- Unknown types and codes.
- Truncation at each common and typed-body boundary.
- No checksum verdicts.

### Neighbor Discovery

- RS, RA, NS, NA, and Redirect.
- Every required option.
- Repeated and unknown options.
- Zero-length option and option overrun.
- Prefix and link-layer address bytes remain source-backed.

### Robustness

- Parser fuzz corpus includes ARP lengths, extension chains, fragments, ICMP types, and ND TLVs.
- Every variable-length loop proves progress.
- Packet-controlled input cannot throw from a dissector.
- Resource exhaustion cannot mutate the tree while dispatch unwinds.
- ASan and UBSan pass for all new modules.

## Performance Gate

- Preserve zero parser allocations per packet after warm-up.
- Existing 47-byte IPv4/UDP Release throughput may not regress by more than 5% from Phase 4.
- Keep IP selector lookup constant-time.
- Add parse-only and full-pipeline measurements for:
  - ARP request;
  - IPv6/UDP;
  - IPv6 with two extension headers;
  - ICMPv6 Neighbor Advertisement with options;
  - a mixed IPv4/IPv6/control/transport corpus.
- Extension-chain cost must scale linearly with the number of bounded headers.
- No packet-path registry string lookup is allowed.

## Out of Scope

- IPv4 or IPv6 fragment reassembly.
- TCP stream tracking, retransmission analysis, or reassembly.
- Application port dispatch, heuristic dispatch, DNS, mDNS, LLMNR, TLS, or QUIC.
- Recursive parsing of ICMP-quoted packets.
- Checksum verdicts or offload heuristics.
- IPv6 jumbograms and Jumbo Payload option semantics.
- Detailed Hop-by-Hop/Destination option TLVs.
- Routing-type-specific semantics.
- AH authentication and ESP decryption.
- Full ICMP legacy and extension catalogs.
- RFC 4884 extension-object dissection.
- SEND, MLD, RPL, Mobile IPv6, and extended echo.
- Persistent ARP/ND caches, topology graph mutation, or active probes.
- UI and RPC changes.

## Exit Criteria

- Ethernet and VLAN dispatch ARP and IPv6 through the catalog.
- IPv4 and IPv6 share a coherent numeric IP protocol dispatch mechanism.
- IPv6 reaches TCP, UDP, ICMPv6, unknown, and no-next outcomes through bounded traversal.
- Supported extension headers cannot loop, overflow, or escape declared boundaries.
- IPv4 reaches ICMPv4 without direct parent-child coupling.
- Required ARP, ICMP, and ND fields are structured and unknown bodies remain visible.
- Fragments are never falsely presented as complete upper-layer PDUs.
- Existing field IDs and existing packet-tree shapes remain stable.
- CTest, Vitest, lint, frozen install, fuzz smoke tests, ASan/UBSan, formatting, and `git diff --check` pass.
- Warmed parsing remains allocation-free and the existing benchmark remains within the 5% gate.
- Mixed dual-stack benchmark results are documented.

## Expected Following Phases

- Phase 6: transport application dispatch semantics and bounded DNS/mDNS/LLMNR dissection.
- Phase 7: capture-scoped analysis store, retention, analysis revisions, packet references, and derived-source provenance.
- Phase 8: IPv4/IPv6 fragment reassembly, followed by TCP stream and PDU reassembly.
