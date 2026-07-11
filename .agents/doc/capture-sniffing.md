# C++ Sniffing Module

The standalone sniffing module lives in `packages/core/cpp`.

The current public API is `pruftnet::sniffing::NetworkSniffer`. It is configured with `SnifferOptions`, started with `start()`, stopped with `stop()`, and emits packets through a user-provided callback.

Current live pipeline:

```text
SnifferRuntime
  -> one PacketSource per configured interface
  -> one capture thread per interface
  -> one bounded SPSC packet ring per interface
  -> single parser thread
  -> immutable bounded dissector catalog
  -> Ethernet / VLAN / ARP / IPv4 / IPv6 / TCP / UDP / ICMP
  -> packet callback(raw packet, parsed packet)
```

Important constraints:

- Capture threads never parse packets.
- The packet callback is called from the parser thread.
- The packet callback is hot-path minimal and does not receive stats; call `NetworkSniffer::stats()` separately.
- Every successful interface-ring push wakes the shared parser thread; the parser does not wait on a single interface ring.
- `RawPacketView::bytes` is valid only during the callback.
- Unsupported link types fail at `start()`.
- Application ring overload drops newest packets per interface and increments per-interface stats.
- The parser emits an owning `ParsedPacketTree`. Unsupported link types and protocol payloads remain visible as unknown bytes instead of stopping capture.
- Parser arenas are recycled after the callback returns. Copying `ParsedPacket` during the callback creates independent retained storage.
- `PacketMetadata::key` combines a per-start random `CaptureId` with a gap-tolerant `PacketId` observation sequence; timestamp order is not guaranteed across interfaces.
- Capture threads wait behind a startup gate until all runtime threads exist and the new capture ID is committed; failed starts cannot publish packets under an unsuccessful ID.
- Start, stop, restart, source replacement, ring replacement, and stats snapshots are serialized by the runtime lifecycle mutex. Startup warnings are delivered only after that mutex is released so callbacks may safely stop the runtime.
- Parser wakeups use a C++20 atomic generation counter. A ring push or capture completion cannot be lost between predicate evaluation and sleep.

Internal architecture:

- `NetworkSniffer` is the public live-capture wrapper.
- `SnifferOptions::interfaces` configures one or more `SnifferInterfaceOptions` entries.
- `SnifferOptions::max_total_ring_bytes` optionally caps total packet-ring memory across all interfaces.
- `SnifferRuntime` owns the shared multi-interface capture/ring/parser lifecycle.
- `interface_discovery.hpp` provides libpcap/Npcap-based capture interface listing and capabilities discovery.
- `PacketSource` abstracts packet input.
- `parsing::PacketView` provides bounded endian-safe reads and zero-copy child views while distinguishing capture truncation, reported-length violations, parent-boundary violations, and offset overflow.
- `parsing::RegistrySnapshot` is bootstrapped before runtime capture starts; its immutable revision is exposed by `NetworkSniffer::registry_revision()`.
- `parsing::internal::DissectorCatalog` provides immutable DLT, EtherType, and family-qualified IP selector tables. IPv6 extension and Neighbor Discovery traversal consume the same central call/depth budgets as ordinary child dispatch.
- `parsing::ParsedPacketTreeBuilder` owns contiguous nodes and bounded arenas; `parsing::PacketTreeEncoder` emits the verified `PRT2` FlatBuffers format.
- `LivePcapPacketSource` uses `pcap_create` / `pcap_activate` for real interfaces.
- `OfflinePcapPacketSource` uses `pcap_open_offline` for deterministic `.pcap` integration tests.
- `tests/support/FakePacketSource` exercises runtime lifecycle and error paths without libpcap live input.

Per-interface options intentionally mirror Wireshark/dumpcap: interface name/id, promiscuous mode, monitor mode, snaplen, pcap buffer size, read timeout, dispatch batch size, ring slots, BPF filter, BPF optimization, requested link type, and timestamp type. Global options currently cover accepted link types, stats polling interval, and total ring-memory budget.

Tests are organized under `packages/core/cpp/tests`:

- `unit/` contains deterministic unit tests.
- `unit/packet_view_tests.cpp` validates endian reads, zero-copy child views, overflow, truncation, reported lengths, and parent boundaries.
- `unit/phase5_dissector_tests.cpp` validates ARP, IPv6 extensions and fragments, family-isolated IP dispatch, ICMPv4, ICMPv6, and Neighbor Discovery options.
- `integration/sniffing_offline_pcap_tests.cpp` runs the pipeline against fixtures and is enabled by default.
- `integration/sniffing_offline_bpf_tests.cpp` validates BPF filtering against the TCP/UDP fixture.
- `integration/sniffing_offline_invalid_pcap_tests.cpp` validates malformed and missing pcap failures.
- `integration/sniffing_offline_multi_pcap_tests.cpp` validates deterministic multi-interface replay from multiple pcap sources.
- `integration/sniffing_runtime_lifecycle_tests.cpp` validates start/stop, destructor shutdown, EOF, callback stop, and truncation metadata.
- `integration/sniffing_runtime_error_tests.cpp` validates open, dispatch, stats, callback, event callback, snapshot, and link-type error paths.
- `integration/sniffing_ring_pressure_tests.cpp` validates overload drops and single `RingFull` event emission.
- `integration/sniffing_multi_interface_tests.cpp` validates multi-interface metadata, stats, auto IDs, parser wakeups, atomic startup failure cleanup, isolated ring pressure, stop under pressure, callback stop, and event callback throws.
- `integration/sniffing_interface_discovery_tests.cpp` validates pcap interface discovery.
- `integration/sniffing_interface_capabilities_live_tests.cpp` is optional and skipped unless `PRUFTNET_TEST_INTERFACE` is set.
- `integration/sniffing_live_tests.cpp` is optional and skipped unless `PRUFTNET_TEST_INTERFACE` is set.
- `fuzz/packet_view_fuzzer.cpp` exercises arbitrary reads and child-view construction across untrusted length combinations.
- `fixtures/ethernet_ipv4_tcp_udp.pcap` currently contains 10 synthetic Ethernet/IPv4 TCP/UDP packets.
- `fixtures/invalid.pcap` is intentionally malformed.

Default accepted link types are `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, and `DLT_LOOP` when available in local libpcap headers.

The first Node/server integration now uses `pruftnet_replay_worker` as a separate C++ process for deterministic offline replay. It provides bounded raw retention, cursor-based summary and event journals, stats, registry descriptors, and selected PRT2 detail. See `backend-sniffing.md` for its Effect RPC and HTTP contracts.

The replay milestone uses bounded NDJSON control messages and a private base64 detail response. Production live integration must replace packet data transfer with shared-memory batches rather than converting packet data into JS objects.
