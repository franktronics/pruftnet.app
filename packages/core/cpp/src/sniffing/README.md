# Sniffing internals

`NetworkSniffer` is the public facade. Read the implementation in this order:

1. `network_sniffer.cpp` selects live or offline packet sources and constructs
   the runtime.
2. `sniffer_runtime.hpp` shows the owned state and lifecycle surface.
3. `sniffer_runtime.cpp` contains the start/stop state machine and the capture,
   writer, and analyzer loops.
4. `packet_ring.*` defines the bounded per-interface handoff to persistence.
5. `packet_source.*` and the live/offline implementations define source
   behavior.

The directory intentionally stays flat. Its files form one capture-runtime
domain, and the following name groups are enough to expose dependency
direction without adding nested navigation:

- Runtime: `network_sniffer.*`, `sniffer_runtime.*`
- Sources/libpcap: `packet_source.*`, `live_pcap_packet_source.*`,
  `offline_pcap_packet_source.*`, `pcap_handle.*`, `link_type.*`
- Buffering: `packet_ring.*`
- Configuration/discovery: `sniffer_options*`, `interface_discovery.cpp`
- Accounting/support: `internal_stats.*`, `packet_identity.*`,
  `sniffer_error.cpp`

## Ownership rules

- A capture thread owns one packet source and produces into one ring.
- The writer is the only ring consumer and the only pcapng block writer.
- The analyzer reads only committed packets from the spool.
- `PacketId` is assigned at observation and may contain explicit gaps.
- Stop must interrupt sources, drain or account rings, finalize persistence,
  then let analysis reach a terminal outcome.
- Capture callbacks must not parse, block on transport, or perform file I/O.

Keep `sniffer_runtime.cpp` cohesive while these loops share one lifecycle state
machine. Split it only when a stage can own its state and shutdown contract;
moving methods into separate compilation units without changing ownership
would hide, rather than clarify, the concurrency boundary.
