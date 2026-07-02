# Pruftnet C++ Sniffing Module

This directory contains the standalone C++ sniffing module. It is intentionally independent from the Node.js core for now.

## Scope

Current pipeline:

```text
PacketSource
  -> LivePcapPacketSource or OfflinePcapPacketSource
  -> capture thread
  -> bounded SPSC packet ring
  -> parser thread
  -> empty parser
  -> user packet callback
```

The parser currently returns an empty future-proof `ParsedPacket` with `ParseStatus::NotParsed`. The callback receives both the raw packet view and the parsed result.

`NetworkSniffer` is the public live-capture wrapper. Internally, `SnifferRuntime` runs the shared capture/ring/parser pipeline against a `PacketSource`, which lets tests execute the same pipeline with offline `.pcap` fixtures.

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
options.interface_name = "en0";
options.promiscuous = false;

pruftnet::sniffing::NetworkSniffer sniffer(
    options,
    [](const auto& raw, const auto& parsed, const auto& stats) {
        // raw.bytes is valid only during this callback.
    });

if (auto error = sniffer.start()) {
    // handle startup error
}

sniffer.stop();
```

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
  unit/
  integration/
  fixtures/
```

Unit tests are deterministic and do not require packet capture permissions.

Offline integration tests use `.pcap` fixtures and are part of the default CTest run. The initial fixture is:

```text
tests/fixtures/ethernet_ipv4_tcp_udp.pcap
```

It contains 10 synthetic Ethernet/IPv4 packets: 5 UDP and 5 TCP packets.

The live sniffing integration test is optional because it depends on local interfaces, permissions, and network traffic. It is skipped unless `PRUFTNET_TEST_INTERFACE` is set:

```bash
PRUFTNET_TEST_INTERFACE=en16 ctest --test-dir packages/core/cpp/build -R integration.sniffing_live
```

Without `PRUFTNET_TEST_INTERFACE`, CTest marks `integration.sniffing_live` as skipped.

## Defaults

- `snaplen`: 512 bytes
- pcap buffer: 64 MiB
- pcap read timeout: 10 ms
- pcap dispatch batch size: 64 packets
- application ring: 65,536 slots
- unsupported link type policy: `start()` fails
- accepted link types: `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, `DLT_LOOP` when available in the local libpcap headers

## Design Notes

The capture callback does no parsing. It copies packet bytes into a preallocated ring and returns quickly to reduce kernel drops.

The user packet callback is called from the parser thread, never from the capture thread.

`RawPacketView::bytes` is valid only during the callback. This avoids an extra ownership layer and keeps the hot path predictable.

When the application ring is full, the newest packet is dropped and `app_ring_drops` is incremented. The capture thread never blocks on parser throughput.

The packet ring slot size is derived from the active packet source snapshot length. Live capture uses the configured `snaplen`; offline capture uses the snapshot length recorded in the fixture.

Future Node/server integration should keep this module as the core capture engine, then connect it through a separate C++ process and a shared-memory ring.
