# Pruftnet C++ Capture Prototype

This directory contains the standalone C++ sniffing prototype. It is intentionally independent from the Node.js core for now.

## Scope

Current pipeline:

```text
libpcap/Npcap
  -> capture thread
  -> bounded SPSC packet ring
  -> parser stub thread
  -> raw packet printer
```

The parser currently does not dissect protocols. It only proves that packets move from libpcap to the parser stage safely.

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

## Usage

List devices:

```bash
packages/core/cpp/build/pruftnet-sniffer --list-devices
```

Capture a small sample:

```bash
packages/core/cpp/build/pruftnet-sniffer --interface en0 --max-packets 10 --print-mode hex
```

Capture without expensive packet printing:

```bash
packages/core/cpp/build/pruftnet-sniffer --interface en0 --print-mode none
```

## Defaults

- `snaplen`: 512 bytes
- pcap buffer: 64 MiB
- pcap read timeout: 10 ms
- dispatch batch size: 64 packets
- application ring: 65,536 slots
- unsupported link type policy: fail fast
- accepted link types: `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, `DLT_LOOP` when available in the local libpcap headers

## Permissions

Linux usually requires root or capabilities such as `CAP_NET_RAW` and `CAP_NET_ADMIN`.

macOS requires packet capture permissions through BPF devices.

Windows requires Npcap and may require Administrator privileges.

## Design Notes

The capture callback does no parsing. It copies packet bytes into a preallocated ring and returns quickly to reduce kernel drops.

When the application ring is full, the newest packet is dropped and `app_ring_drops` is incremented. The capture thread never blocks on parser throughput.

Unsupported link-layer types fail at startup by default. A debug mode exists through `--unsupported-linktype raw`, but production parsing should keep fail-fast behavior until a parser is explicitly available.
