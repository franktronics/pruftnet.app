# Parser and Dissector Contracts

## Packet views and identity

`PacketKey { captureId, packetId }` identifies a packet across summaries,
detail, references, exports, and diagnostics. `PacketId` is assigned before
admission, so it can contain gaps and is never a file ordinal or array index.
The raw pcapng spool is authoritative. Summaries and details are derived; an
evicted raw packet must report eviction rather than return a detail tree without
the selected bytes.

Each decoded view carries a registry and analysis revision. Reassembly may make
an earlier packet richer after later input arrives, so clients may refresh when
the analysis revision advances. Registry descriptors have stable text keys and
freeze into one immutable capture-scoped snapshot. Append built-ins only: never
renumber existing protocol or field identifiers.

## Parser behavior

The parser owns capture-scoped reassembly state, source clipping, root creation,
and tree finalization. The immutable catalog dispatches by DLT, EtherType,
LLC/SNAP, IP protocol, and transport port selectors. Parents dispatch selectors;
they do not call child dissectors directly.

Every parser stage has bounded depth, dissector calls, fields, strings, bytes,
sources, diagnostics, and reassembly state. Truncation returns `Partial`, an
impossible declaration returns `Malformed`, and an exhausted bound returns a
valid `ResourceLimit` prefix. Unsupported, encrypted, or trailing data remains
source-backed unknown data. Packet-controlled bytes must not throw from parsing.

The selected-packet tree contains metadata, nodes, sources, references,
diagnostics, and complete captured bytes. Source offsets are relative to their
declared source. Repeated fields remain ordered occurrences, not a map. `PRT2`
input is verified in C++ and TypeScript before traversal.

## Adding a dissector

Place each protocol in its link, network, transport, application, tunnel, or
shared family. Keep immutable resolved field IDs beside that dissector. Append
registry descriptors, register construction in the matching catalog section,
bind the correct selector, and add the source to CMake. Do not use global
self-registration or mutable catalog state.

Tests must cover valid dispatch, truncation, malformed input, unknown bytes,
and resource limits. Add reassembly provenance and recursion tests when
applicable. Keep warm parsing allocation-free. Run `pnpm test:cpp`, relevant
fuzz smoke tests, and a Release parser benchmark for parser or dissector work.

## Built-in scope

Built-ins include common link formats, ARP/IP/ICMP and control protocols,
TCP/UDP, DNS, DHCP, NTP, HTTP/1.x, TLS records and cleartext handshakes, QUIC
headers, and common tunnels. TLS application data, QUIC protection and frames,
HTTP/2 and HTTP/3 remain opaque or unsupported by design. Do not imply protocol
coverage beyond parsed fields and explicit unknown data.
