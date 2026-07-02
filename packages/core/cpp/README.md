# Pruftnet C++ Sniffing Module

This directory contains the standalone C++ sniffing module. It is intentionally independent from the Node.js core for now.

## Scope

Current pipeline:

```text
libpcap/Npcap
  -> capture thread
  -> bounded SPSC packet ring
  -> parser thread
  -> empty parser
  -> user packet callback
```

The parser currently returns an empty future-proof `ParsedPacket` with `ParseStatus::NotParsed`. The callback receives both the raw packet view and the parsed result.

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

## Smoke Test

The example is intentionally not a CLI. Edit the constants directly in:

```text
examples/sniffing_smoke_test.cpp
```

Set `kInterfaceName`, then build and run:

```bash
packages/core/cpp/build/sniffing_smoke_test
```

It prints the first bytes of raw packets, the empty parse result, and live stats.

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

Future Node/server integration should keep this module as the core capture engine, then connect it through a separate C++ process and a shared-memory ring.
