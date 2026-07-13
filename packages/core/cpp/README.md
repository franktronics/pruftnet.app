# Pruftnet C++ Capture and Analysis Engine

This module provides the cross-platform libpcap/Npcap capture engine shared by desktop and server mode.

```text
one capture thread + bounded byte queue per interface
  -> serialized pcapng writer
  -> committed packet index
  -> asynchronous analyzer
  -> summary callback and on-demand PRT2 detail
```

Raw packets are persisted before parsing. The live pcapng spool is authoritative; parser or UI latency cannot block capture persistence. Queue capacity is bounded independently by packets and bytes, and every rejection has an exact counter.

Primary public headers:

```text
include/pruftnet/sniffing/network_sniffer.hpp
include/pruftnet/sniffing/sniffer_options.hpp
include/pruftnet/sniffing/sniffer_stats.hpp
include/pruftnet/capture/pcapng_spool.hpp
```

`NetworkSniffer::persisted_packet` locates committed raw data by capture and packet ID. `PcapngSpool::recover_segment` validates a segment and can truncate an incomplete crash tail to its last complete block.

## Build and test

Requirements are CMake 3.24+, C++20, and libpcap on Linux/macOS or the Npcap SDK on Windows.

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build
cmake --build packages/core/cpp/build
ctest --test-dir packages/core/cpp/build --output-on-failure
```

Live interface tests are skipped unless `PRUFTNET_TEST_INTERFACE` is set. Unit and fake-source integration tests require no capture privileges.

## Benchmarks and fuzzers

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build \
  -DPRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON \
  -DPRUFTNET_SNIFFING_BUILD_FUZZERS=ON
cmake --build packages/core/cpp/build --target \
  sniffing_runtime_benchmark packet_parser_benchmark packet_parser_fuzzer packet_view_fuzzer
```

The runtime benchmark reports queue and spool packet/byte throughput, commit latency, write amplification, multi-interface high-water marks, exact drops, persistence, and final analysis backlog. Use Release builds and identical storage/flush settings for comparisons.

Full architecture, statistics definitions, conservation equations, retention, worker behavior, platform notes, and troubleshooting live in `.agents/doc/capture-architecture.md`.
