# C++ Architecture and Quality Audit

This is the contributor map and ranked audit for `packages/core/cpp`. It
separates observed ownership problems from optional style changes.

## Architecture map

```text
apps/desktop or apps/server
  -> packages/core/src/app.ts (Effect layer assembly)
  -> packages/core/src/capture/service.ts (typed control adapter)
  -> packages/core/src/capture/replay-worker.ts (framed child process)
  -> tools/capture_worker_main.cpp (native executable entry)
  -> tools/capture_worker.cpp (command/session ownership)
  -> NetworkSniffer (public C++ facade)
       -> live/offline PacketSource + PcapHandle
       -> PacketRing per interface
       -> SnifferRuntime writer
       -> PcapngSpool + pcapng_format
       -> SnifferRuntime analyzer
       -> PacketParser -> dissector catalog -> ParsedPacketTree
  -> SummaryJournal/EventJournal or on-demand PRT2 detail
  -> shared Effect RPC contracts
```

Public C++ API is limited to `include/pruftnet/`. `src/` is library-private,
and `tools/` is executable-private. `schemas/packet_tree.fbs`, pcapng metadata,
PRT2, and worker protocol version 2 are compatibility boundaries even when
their implementation is private.

The vendored Wireshark reference reinforces the process boundary, not its
directory depth: its `dumpcap` target deliberately avoids UI libraries and
links a focused capture/source set. Pruftnet keeps the same capture-worker
separation while retaining a much smaller, flatter domain layout appropriate
to the current codebase.

## Ranked findings

### 1. Binary format and spool lifecycle were mixed — changed now

- Evidence: `pcapng_spool.cpp` combined byte-order primitives, pcapng block
  encoding, recovery parsing, portable file I/O, retention, indexing, commit
  publication, and leases in 943 lines.
- Boundary: `pcapng_format.*` now owns pcapng encoding and recovery;
  `pcapng_spool.cpp` owns sink lifecycle, retention, indexing, and commits.
- Benefit: binary compatibility code is reviewable independently from spool
  state transitions.
- Risk: writer-path call boundaries and recovery behavior. Existing spool,
  recovery, runtime benchmarks, and full integration tests protect them.
- Platform impact: none; file opening remains in the existing Windows/POSIX
  sink implementation.

### 2. Worker entry and protocol primitives were hidden — changed now

- Evidence: `capture_worker.cpp` contained JSON field extraction, framing,
  command dispatch, session state, detail execution, and `main` in 1,412 lines.
- Boundary: `capture_worker_main.cpp` is the visible entry point;
  `capture_worker_protocol.*` owns bounded framing and control-field parsing.
- Benefit: transport limits and malformed-frame behavior have direct unit
  coverage and can evolve without navigating capture-session handlers.
- Risk: worker version-2 compatibility. A protocol test preserves duplicate
  field rejection, truncation classification, oversize draining, and framing.
- Platform impact: Windows binary standard-stream setup remains at the worker
  process boundary.

### 3. Optional CMake targets obscured the production target — changed now

- Evidence: one 500-line `CMakeLists.txt` interleaved production sources with
  27 tests, benchmarks, codec generation, and fuzzer setup.
- Boundary: the main file owns dependencies, code generation, production
  library, and worker. Three focused modules own tests, benchmarks, and
  fuzzers. Cross-compilation and host `flatc` validation remain in the main
  file.
- Benefit: production target changes no longer require scanning every optional
  target, while each optional family remains in one predictable file.
- Risk: CMake scope and option behavior. Configure and build with tests and
  benchmarks enabled after every change; verify fuzzers separately.

### 4. Parser tests duplicated tree lookup logic — changed now

- Evidence: `packet_parser_tests.cpp` and `phase5_dissector_tests.cpp` carried
  equivalent field-ID, node lookup, and node-count implementations.
- Boundary: `tests/support/parsed_tree_test_support.hpp` owns only those three
  assertions; packet construction and scenario setup stay local.
- Benefit: protocol tests remain explicit while shared tree semantics have one
  implementation.
- Risk: low; assertions and test-only linkage are unchanged.

### 5. `Worker` still owns several endpoint families — later

- Evidence: the remaining worker class owns lifecycle, stats serialization,
  summaries, events, segment leases, stored recovery, detail artifacts, and
  interface discovery.
- Proposed boundary: separate stateful capture-session operations from
  stateless response serialization and stored-capture detail recovery.
- Why later: handlers share session identity, registry revision, spool leases,
  and analyzed-packet state. Splitting before command-level native integration
  tests would move risk without proving a stable ownership boundary.
- Required protection: request/response fixtures for every operation, late
  detail completion, shutdown, path validation, and revision mismatch.

### 6. `SnifferRuntime` is large but currently cohesive — not now

- Evidence: the runtime owns source startup, capture loops, writer, analyzer,
  shutdown, and conservation counters in 1,152 lines.
- Objective concern: it has broad ownership and complex shutdown ordering.
- Counter-evidence: the loops share one private interface context, one start
  gate, terminal failure accounting, and a single conservation state machine.
  A compilation-unit-only split would obscure those relationships.
- Revisit when: writer or analyzer becomes independently replaceable. Extract
  an owning stage with an explicit stop/drain contract, then rerun lifecycle,
  ring-pressure, multi-interface, error, and runtime benchmarks.

### 7. Other large files and tests are cohesive — not now

- `packet_tree_codec.cpp` keeps semantic verification beside zero-copy views
  and encoding for one PRT2 contract.
- `parsed_tree.cpp` keeps arena bounds, builder budgets, and tree finalization
  together for one allocation-sensitive model.
- Large parser/dissector tests protect distinct truncation, malformed-length,
  protocol-dispatch, and resource-budget cases. No behavior-equivalent cases
  were removed.

## Public surface and dependency review

- `NetworkSniffer::Impl` forwarding methods remain because the PIMPL keeps
  packet-source and runtime implementation headers out of the public facade;
  they are not redundant API layers.
- `ParsedPacket` remains a semantic alias for the parsed result delivered by
  the sniffing callback.
- `SpoolSink` and `SpoolSinkFactory` are exposed through the public spool
  header mainly for failure injection. Internalizing them would narrow the API,
  but it also changes `PcapngSpool::create`; defer that until external C++
  consumers are explicitly inventoried.
- The dependency direction is sniffing primitives -> capture and parsing ->
  runtime composition -> worker transport. No source-level include cycle or
  generated-file dependency was found.
- Compiler warnings and `clang-tidy` found no dead or unreachable production
  code. No removal was made without a behavior-preserving test boundary.

## Test classification

- Essential behavior: packet ring, spool/recovery, packet view, registry,
  parsed tree, codec, parser/dissectors, summaries, and replay journal tests.
- Failure/lifecycle/concurrency/regression: invalid/offline pcap, BPF,
  multi-interface, runtime lifecycle/error/ring-pressure, and worker protocol
  tests.
- Performance/allocation protection: parsed-tree and parser allocation tests,
  plus the runtime, parser, tree, and codec benchmarks.
- Platform coverage: interface discovery is privilege-free; live capability
  and capture tests use skip code 77 when no test interface is configured.
- Duplicate coverage: no behavior-equivalent tests were proven. Only repeated
  parsed-tree lookup setup was consolidated.
- Implementation-detail or obsolete tests: none were shown to obstruct a valid
  boundary or protect no behavior, so none were removed or weakened.

## Verification snapshot

The 2026-07-15 audit used paired Release builds of repository `HEAD` and the
refactor on the same machine, compiler, filesystem, fixtures, and flush policy.
Two interleaved samples produced:

| Runtime benchmark | Baseline range | Refactor range |
| --- | ---: | ---: |
| pcapng, 64-byte packets | 2.64–2.80 M packets/s | 2.81–2.89 M packets/s |
| pcapng, 1,514-byte packets | 1.63–1.67 M packets/s | 1.67–1.70 M packets/s |
| fake two-interface runtime | 49.2–51.0 K packets/s | 50.3–52.1 K packets/s |

Write amplification stayed exactly 2.12502 for 64-byte packets and 1.04888
for 1,514-byte packets. These short samples demonstrate no observed regression;
they are not a general hardware performance claim.

The baseline suite passed 27 tests. The refactor passed 28 tests, including the
new worker-protocol test; the two privilege-dependent live tests were skipped
in both runs. All standalone fuzzer targets built and passed their default
seed, and `clang-tidy` completed for production and worker sources with the
configured compilation database.

## Where to add changes

- New capture source behavior: `src/sniffing/*packet_source*` and
  `pcap_handle.*`.
- Queue/backpressure behavior: `packet_ring.*`, runtime accounting, and
  pressure tests.
- pcapng compatibility: `src/capture/pcapng_format.*`; commit/retention policy:
  `pcapng_spool.*`.
- New protocol: `src/parsing/dissectors`, catalog/registry definitions, parser
  tests, and truncation/resource-limit cases.
- PRT2 compatibility: `schemas/packet_tree.fbs` and `packet_tree_codec.*`, with
  C++/TypeScript codec tests.
- Worker operation: `tools/capture_worker.cpp`; framing or bounded control
  parsing: `capture_worker_protocol.*`.
- Application RPC: shared schemas first, thin Effect handlers second, React
  consumers last.

## Invariants that must not change

- Capture callbacks only identify and enqueue packets.
- The writer is the sole loss-critical consumer and persists before analysis.
- Commit publication follows complete block write and configured flush.
- Packet order is spool writer service order; timestamps and interface IDs
  preserve source facts.
- Every observed packet is accepted or rejected by one exact reason.
- Every persisted packet reaches analyzed, evicted-before-analysis, or rejected.
- Shutdown drains or explicitly accounts all accepted packets.
- pcapng, PRT2, registry revision, worker framing, and decimal `uint64` transport
  remain compatible across Linux, macOS, Windows, desktop, and server mode.
