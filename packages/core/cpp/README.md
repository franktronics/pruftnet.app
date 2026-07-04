# Pruftnet C++ Sniffing Module

This directory contains the standalone C++ sniffing module. It is intentionally independent from the Node.js core for now.

## Scope

Current live pipeline:

```text
SnifferRuntime
  -> one PacketSource per configured interface
  -> one capture thread per interface
  -> one bounded SPSC packet ring per interface
  -> single parser thread
  -> empty parser
  -> user packet callback
```

The parser currently returns an empty future-proof `ParsedPacket` with `ParseStatus::NotParsed`. The callback receives both the raw packet view and the parsed result.

`NetworkSniffer` is the public live-capture wrapper. Internally, `SnifferRuntime` runs the shared multi-interface capture/ring/parser pipeline against `PacketSource` instances, which lets tests execute the same pipeline with offline `.pcap` fixtures and fake sources.

## Public API

The public headers live under:

```text
include/pruftnet/sniffing/
```

Primary entry point:

```cpp
#include <pruftnet/sniffing/network_sniffer.hpp>
```

Minimal usage:

```cpp
pruftnet::sniffing::SnifferOptions options;

pruftnet::sniffing::SnifferInterfaceOptions interface;
interface.name = "en0";
interface.promiscuous = false;
options.interfaces.push_back(interface);

pruftnet::sniffing::NetworkSniffer sniffer(
    options,
    [](const auto& raw, const auto& parsed) {
        // raw.bytes is valid only during this callback.
    });

if (auto error = sniffer.start()) {
    // handle startup error
}

sniffer.stop();
```

`SnifferOptions::interfaces` may contain multiple interfaces. Each interface receives its own pcap handle, capture thread, and packet ring. Packet callbacks remain serialized on the single parser thread. `RawPacketView::metadata.interface_id` identifies the source interface for each packet.

Per-interface live options are modeled after Wireshark/dumpcap capture options:

- `name`: libpcap/Npcap interface name.
- `id`: stable ID written to packet metadata; defaults to auto-assignment by interface order.
- `promiscuous`: request promiscuous mode.
- `monitor_mode`: request RF monitor mode when supported by libpcap and the interface.
- `snaplen`: snapshot length.
- `pcap_buffer_size_bytes`: kernel capture buffer size.
- `read_timeout_ms`: pcap read timeout.
- `pcap_dispatch_batch_size`: max packets per dispatch call.
- `ring_slots`: application ring capacity for that interface.
- `bpf_filter`: capture filter for that interface.
- `bpf_optimize`: whether pcap should optimize the BPF program.
- `requested_link_type`: optional requested DLT/link-layer type.
- `timestamp_type`: optional pcap timestamp type name.

Global options currently cover parser/runtime policy: accepted link types, stats polling interval, and optional total ring-memory budget via `max_total_ring_bytes`.

Capture interface discovery is available through:

```cpp
#include <pruftnet/sniffing/interface_discovery.hpp>
```

Use `list_capture_interfaces()` and `read_interface_capabilities()` when building UI or preflight validation. These APIs use libpcap/Npcap as the source of truth for capturable interfaces, supported DLT/link-layer types, timestamp types, and monitor-mode capability.

## Build

Requirements:

- CMake 3.24+
- C++20 compiler
- libpcap on Linux/macOS or Npcap SDK on Windows

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build
cmake --build packages/core/cpp/build
ctest --test-dir packages/core/cpp/build
```

## Tests

Tests are split by scope:

```text
tests/
  test_config.hpp
  support/
  unit/
  integration/
  fixtures/
```

Unit tests are deterministic and do not require packet capture permissions.

Integration tests cover both real `.pcap` input and deterministic fake sources. `tests/support/FakePacketSource` is used to exercise lifecycle, runtime error paths, packet metadata, truncation, stats failures, and ring pressure without relying on live interfaces.

Offline integration tests use `.pcap` fixtures and are part of the default CTest run. The initial valid fixture is:

```text
tests/fixtures/ethernet_ipv4_tcp_udp.pcap
```

It contains 10 synthetic Ethernet/IPv4 packets: 5 UDP and 5 TCP packets.

The suite also includes `tests/fixtures/invalid.pcap` to verify malformed pcap handling. The offline BPF tests currently assert these filters against the valid fixture: no filter, `udp`, `tcp`, `port 8080`, `icmp`, and an invalid filter expression.

Current CTest targets:

```text
unit.packet_ring
unit.sniffer_options
integration.sniffing_offline_pcap
integration.sniffing_offline_bpf
integration.sniffing_offline_invalid_pcap
integration.sniffing_offline_multi_pcap
integration.sniffing_runtime_lifecycle
integration.sniffing_runtime_errors
integration.sniffing_ring_pressure
integration.sniffing_multi_interface
integration.sniffing_interface_discovery
integration.sniffing_interface_capabilities_live
integration.sniffing_live
```

Live integration tests are optional because they depend on local interfaces, permissions, and network traffic. They are skipped unless `PRUFTNET_TEST_INTERFACE` is set:

```bash
PRUFTNET_TEST_INTERFACE=en16 ctest --test-dir packages/core/cpp/build -R integration.sniffing_live
```

Without `PRUFTNET_TEST_INTERFACE`, CTest marks `integration.sniffing_live` and `integration.sniffing_interface_capabilities_live` as skipped.

Optional development targets are disabled by default:

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build \
  -DPRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON \
  -DPRUFTNET_SNIFFING_BUILD_FUZZERS=ON
cmake --build packages/core/cpp/build --target sniffing_runtime_benchmark empty_packet_parser_fuzzer
```

## Defaults

- per-interface `snaplen`: 512 bytes
- per-interface pcap buffer: 64 MiB
- per-interface pcap read timeout: 10 ms
- per-interface pcap dispatch batch size: 64 packets
- per-interface application ring: 65,536 slots
- total ring-memory budget: disabled by default (`max_total_ring_bytes = 0`)
- unsupported link type policy: `start()` fails
- accepted link types: `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, `DLT_LOOP` when available in the local libpcap headers

## Design Notes

Each capture callback does no parsing. It copies packet bytes into that interface's preallocated ring and returns quickly to reduce kernel drops.

The user packet callback is called from the parser thread, never from the capture thread.

The user packet callback receives only `RawPacketView` and `ParsedPacket`. Full stats remain available through `NetworkSniffer::stats()` outside the packet hot path, avoiding per-packet vector allocation in the parser thread.

Every successful interface-ring push wakes the shared parser thread, so an idle interface cannot delay packets arriving on another interface.

`RawPacketView::bytes` is valid only during the callback. This avoids an extra ownership layer and keeps the hot path predictable.

When an interface application ring is full, the newest packet for that interface is dropped and `app_ring_drops` is incremented for that interface. Capture threads never block on parser throughput or on other interfaces.

Packet ordering is defined by `PacketMetadata::sequence`, a global runtime arrival sequence. Timestamp ordering across interfaces is not guaranteed because pcap timestamp sources can differ by interface and OS.

The packet ring slot size is derived from each active packet source snapshot length. Live capture uses the configured per-interface `snaplen`; offline capture uses the snapshot length recorded in the fixture.

If file writing is added later, multi-interface captures should use pcapng rather than classic pcap, matching Wireshark/dumpcap behavior.

Future Node/server integration should keep this module as the core capture engine, then connect it through a separate C++ process and a shared-memory ring.
