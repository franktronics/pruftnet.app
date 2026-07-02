# C++ Sniffing Module

The standalone sniffing module lives in `packages/core/cpp`.

The current public API is `pruftnet::sniffing::NetworkSniffer`. It is configured with `SnifferOptions`, started with `start()`, stopped with `stop()`, and emits packets through a user-provided callback.

Current pipeline:

```text
PacketSource
  -> LivePcapPacketSource or OfflinePcapPacketSource
  -> capture thread
  -> bounded SPSC packet ring
  -> parser thread
  -> empty parser
  -> packet callback(raw packet, parsed packet, stats)
```

Important constraints:

- The capture thread never parses packets.
- The packet callback is called from the parser thread.
- `RawPacketView::bytes` is valid only during the callback.
- Unsupported link types fail at `start()`.
- Application ring overload drops newest packets and increments stats.
- The parser is intentionally empty for now and returns `ParseStatus::NotParsed`.

Internal architecture:

- `NetworkSniffer` is the public live-capture wrapper.
- `SnifferRuntime` owns the shared capture/ring/parser lifecycle.
- `PacketSource` abstracts packet input.
- `LivePcapPacketSource` uses `pcap_create` / `pcap_activate` for real interfaces.
- `OfflinePcapPacketSource` uses `pcap_open_offline` for deterministic `.pcap` integration tests.
- `tests/support/FakePacketSource` exercises runtime lifecycle and error paths without libpcap live input.

Tests are organized under `packages/core/cpp/tests`:

- `unit/` contains deterministic unit tests.
- `integration/sniffing_offline_pcap_tests.cpp` runs the pipeline against fixtures and is enabled by default.
- `integration/sniffing_offline_bpf_tests.cpp` validates BPF filtering against the TCP/UDP fixture.
- `integration/sniffing_offline_invalid_pcap_tests.cpp` validates malformed and missing pcap failures.
- `integration/sniffing_runtime_lifecycle_tests.cpp` validates start/stop, destructor shutdown, EOF, callback stop, and truncation metadata.
- `integration/sniffing_runtime_error_tests.cpp` validates open, dispatch, stats, callback, event callback, snapshot, and link-type error paths.
- `integration/sniffing_ring_pressure_tests.cpp` validates overload drops and single `RingFull` event emission.
- `integration/sniffing_live_tests.cpp` is optional and skipped unless `PRUFTNET_TEST_INTERFACE` is set.
- `fixtures/ethernet_ipv4_tcp_udp.pcap` currently contains 10 synthetic Ethernet/IPv4 TCP/UDP packets.
- `fixtures/invalid.pcap` is intentionally malformed.

Default accepted link types are `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, and `DLT_LOOP` when available in local libpcap headers.

Future Node/server integration should use this module from a separate C++ process and expose packet batches through a shared-memory ring rather than converting packet data into JS objects.
