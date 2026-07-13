# C++ Capture Engine

`packages/core/cpp` implements the capture-first engine described in [capture-architecture.md](capture-architecture.md).

`NetworkSniffer` owns one `PacketSource`, capture thread, and bounded descriptor/byte SPSC queue per interface; one serialized pcapng writer; and one asynchronous analyzer. Capture callbacks only validate metadata, assign packet identity, and copy bytes. Full protocol dissection begins after commit.

Public configuration includes per-interface libpcap/Npcap settings, packet and byte queue bounds, plus spool directory, quota, segmentation, ring retention, temporary-file policy, flush interval, and flush-byte threshold. `persisted_packet` serves raw packet bytes from the authoritative spool. `spool_paths` exposes current retained segments to the local worker.

The default build runs deterministic pcapng, queue, parser, fake-source, multi-interface, lifecycle, failure, and conservation tests. Live tests remain opt-in through `PRUFTNET_TEST_INTERFACE`. Optional benchmarks are enabled with `PRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON`.
