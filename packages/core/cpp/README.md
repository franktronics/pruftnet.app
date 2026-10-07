# Pruftnet C++ Capture and Analysis Engine

This module is the cross-platform libpcap/Npcap engine used by desktop and
server mode.

## Start here

- Executable entry: `tools/capture_worker_main.cpp`
- Worker command dispatch: `tools/capture_worker.cpp`
- Public capture API: `include/pruftnet/sniffing/network_sniffer.hpp`
- Public API implementation: `src/sniffing/network_sniffer.cpp`
- Runtime state machine: `src/sniffing/sniffer_runtime.cpp`
- Detailed contributor map: `../../../.agents/doc/cpp-architecture.md`
- Capture invariants: `../../../.agents/doc/capture-architecture.md`
- Parser and dissector contracts: `../../../.agents/doc/parser-architecture.md`

Only headers under `include/pruftnet/` are C++ library API. Files under `src/`
and `tools/` are implementation details. The framed worker protocol is an
external process contract even though its C++ implementation is internal.

## Data flow

```text
libpcap/Npcap or offline pcap
  -> one capture thread and bounded byte queue per interface
  -> serialized pcapng writer
  -> committed packet index
  -> asynchronous analyzer and dissectors
  -> compact summary/event journals
  -> framed worker protocol
  -> Effect capture service and shared RPC contracts
```

Raw packets are persisted before parsing. Parser, transport, and UI latency
must never block capture persistence. Queue capacity is bounded independently
by packet count and bytes, and every rejection has an exact counter.

## Domain ownership

- `src/sniffing`: runtime orchestration, packet sources, libpcap handles,
  buffering, configuration, discovery, identity, and capture statistics.
- `src/capture`: pcapng format encoding/recovery and spool commit/retention.
- `src/parsing`: registry, bounded tree construction, dissector dispatch,
  summaries, and PRT2 encoding/verification.
- `src/parsing/catalog`: deterministic family registration and selector
  binding.
- `src/parsing/dissectors`: protocol-specific parsing grouped by family.
- `src/replay`: bounded summary and event journals.
- `tools`: worker executable, protocol framing, and command endpoints.
- `tests`, `benchmarks`, `fuzz`: correctness, lifecycle, allocation,
  performance, and hostile-input protection.

## Adding protocol support

Add the dissector under the matching `src/parsing/dissectors/<family>`
directory, append its fields, and register dispatch in the matching catalog
section. Follow the
[`Adding a New Dissector`](../../../.agents/doc/parser-architecture.md#adding-a-dissector)
checklist. Do not add parsing to capture callbacks, the writer, Node, or
React.

The current catalog contains 38 protocols and 649 fields, including bounded
IP/TCP reassembly, core LAN/control protocols, DNS/DHCP/NTP, common tunnels,
HTTP/1.x, TLS cleartext handshake metadata, and protected QUIC v1/v2 header
metadata. See `../../../.agents/doc/parser-architecture.md` for the supported
scope and contribution rules.

## Build and test

Requirements are CMake 3.24+, C++20, and libpcap on Linux/macOS or the Npcap
SDK on Windows.

```bash
pnpm build:cpp
pnpm test:cpp
```

Equivalent direct commands:

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build
cmake --build packages/core/cpp/build
ctest --test-dir packages/core/cpp/build --output-on-failure
```

Live interface tests are skipped unless `PRUFTNET_TEST_INTERFACE` is set.

## Benchmarks and fuzzers

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build \
  -DCMAKE_BUILD_TYPE=Release \
  -DPRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON \
  -DPRUFTNET_SNIFFING_BUILD_FUZZERS=ON
cmake --build packages/core/cpp/build
```

Optional targets are owned by `cmake/PruftnetTests.cmake`,
`cmake/PruftnetBenchmarks.cmake`, and `cmake/PruftnetFuzzers.cmake`.
Compare benchmarks only with the same compiler, build type, storage, fixture,
and flush policy. When a parser change alters the number of emitted nodes,
compare both packets per second and nodes per second; packet rate alone is no
longer an equivalent-work measurement.
