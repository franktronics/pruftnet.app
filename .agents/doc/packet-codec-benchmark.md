# Packet Codec Benchmark

The parser wire codec is selected by measurement before it is used by production parser or transport code.

## Candidates

- FlatBuffers 25.9.23 using a data-oriented schema with vectors of fixed structs.
- A minimal custom little-endian layout using fixed headers, contiguous record arrays, and byte arenas.

Both candidates encode the same logical summary and selected-packet datasets. The custom format is a benchmark prototype, not an approved production protocol.

## Workloads

Summary batches cover 64, 1,024, and 8,192 packets. Each packet has:

- Capture metadata.
- A variable protocol path.
- Four typed summary columns.

Selected packet details cover 32, 256, and 2,048 field nodes. They include:

- Repeated fields and parent indexes.
- Captured and reassembled data sources.
- Typed values.
- Packet contributors.
- Variable byte and name arenas.

The largest summary and detail artifacts are written to disk for the Node and worker benchmark. Disk I/O is excluded from measured pass-through and decode loops.

## Measurements

The C++ stage reports:

- Encoded bytes.
- Encode operations per second.
- Decode/traversal operations per second.
- Deterministic traversal checksum.
- Builder allocation events where the codec exposes them.

The Node stage reports:

- Zero-transform `Buffer` pass-through operations per second.
- Main-thread decode/traversal operations per second.
- Worker decode/traversal operations per second.
- Copy plus transferable-postMessage round trips per second.
- Matching checksums between codecs and execution contexts.

`worker_threads` is used as a reproducible Node equivalent of the browser Web Worker boundary. The selected codec must still be validated in a real browser when the first frontend vertical slice is implemented.

## Safety Checks

- C++ FlatBuffers decode uses the generated verifier.
- The custom decoder validates magic, version, total size, section offsets, section lengths, and arithmetic overflow before traversal.
- The Node decoders reject truncated benchmark artifacts.
- Checksums prevent a benchmark from optimizing away record traversal.

## Commands

```bash
cmake -S packages/core/cpp -B packages/core/cpp/build-codec-benchmark \
  -DPRUFTNET_SNIFFING_BUILD_TESTS=OFF \
  -DPRUFTNET_SNIFFING_BUILD_BENCHMARKS=ON \
  -DCMAKE_BUILD_TYPE=Release
cmake --build packages/core/cpp/build-codec-benchmark --target packet_codec_benchmark
packages/core/cpp/build-codec-benchmark/packet_codec_benchmark \
  packages/core/cpp/build-codec-benchmark/packet-codec-artifacts
node packages/core/cpp/benchmarks/packet_codec/packet_codec_node_benchmark.mjs \
  packages/core/cpp/build-codec-benchmark/packet-codec-artifacts
```

## Decision Gate

After the benchmark runs, record the environment, raw results, interpretation, and codec recommendation in this document. Stop before parser production implementation and update only the affected sections of the approved plan for final review.

## Results

Environment:

- Date: 2026-07-10.
- OS: macOS Darwin 25.5.0, arm64.
- CPU: Apple M1 Pro.
- Memory: 16 GiB.
- Compiler: AppleClang 21.0.0.
- CMake: 4.1.2.
- Node.js: 26.4.0.
- Build: Release.

All corresponding custom and FlatBuffers traversals produced the same checksums. Both C++ verifiers and both Node decoders rejected truncated artifacts.

### C++ Representative Results

| Workload | Codec | Bytes | Encode ops/s | Decode ops/s | Builder allocations |
| --- | --- | ---: | ---: | ---: | ---: |
| Summary, 64 packets | Custom | 10,432 | 415,366 | 6,481,930 | 1 |
| Summary, 64 packets | FlatBuffers | 10,472 | 576,493 | 5,385,990 | 3 |
| Summary, 1,024 packets | Custom | 165,952 | 28,885 | 377,311 | 1 |
| Summary, 1,024 packets | FlatBuffers | 165,992 | 42,960 | 362,735 | 3 |
| Summary, 8,192 packets | Custom | 1,327,168 | 3,586 | 48,114 | 1 |
| Summary, 8,192 packets | FlatBuffers | 1,327,208 | 4,766 | 48,272 | 3 |
| Detail, 32 nodes | Custom | 3,068 | 2,354,190 | 9,338,520 | 1 |
| Detail, 32 nodes | FlatBuffers | 3,112 | 882,940 | 6,944,440 | 3 |
| Detail, 256 nodes | Custom | 15,244 | 438,516 | 3,628,660 | 1 |
| Detail, 256 nodes | FlatBuffers | 15,288 | 327,976 | 2,999,250 | 2 |
| Detail, 2,048 nodes | Custom | 115,788 | 56,481 | 510,909 | 1 |
| Detail, 2,048 nodes | FlatBuffers | 115,832 | 46,281 | 512,876 | 2 |

The FlatBuffers overhead was 40 bytes for a 1.27 MiB summary batch and 44 bytes for a 113 KiB detail message. The formats are therefore equivalent in practical size for this data-oriented schema.

FlatBuffers encoded the largest summary batch about 33% faster. The custom codec encoded the largest detail about 22% faster. Decode throughput converged for the largest C++ workloads. Small details strongly favored the custom encoder, but details are on-demand rather than the capture hot path.

The allocation column counts the output allocation for the custom codec and FlatBufferBuilder allocation events. It does not count temporary input-model vectors. Production arenas can reduce both.

### Node and Worker Representative Results

The largest artifacts were tested in both codec orders to expose warmup and scheduling bias.

| Workload | Operation | Custom ops/s | FlatBuffers ops/s |
| --- | --- | ---: | ---: |
| Summary, 8,192 packets | Main-thread traversal | 454-498 | 457-498 |
| Summary, 8,192 packets | Worker traversal | 336-511 | 337-477 |
| Detail, 2,048 nodes | Main-thread traversal | 10,828-12,330 | 10,450-10,569 |
| Detail, 2,048 nodes | Worker traversal | 11,665-12,169 | 11,846-11,872 |

The second summary worker run in a process was consistently slower regardless of codec. The order reversal demonstrated that this was a benchmark scheduling/JIT effect, not a codec result. Detail traversal was stable and close enough that neither physical layout established a meaningful frontend advantage.

Creating a Node `Buffer` view without transformation sustained approximately 13-18 million operations per second. Copy plus transferable worker round trips were dominated by message size and scheduling, not the 40-44 byte codec difference.

The Node FlatBuffers traversal intentionally uses zero-allocation data-oriented access rather than unpacking into JS objects. A real browser benchmark with the selected generated/runtime access strategy remains a gate in the frontend vertical slice.

## Decision

Use FlatBuffers 25.9.23 for the first production packet wire format, with the benchmark's data-oriented constraints:

- Vectors of fixed structs for summary records, field nodes, data sources, and contributors.
- Separate scalar and byte arenas instead of nested table-per-field output.
- No object-API unpacking in Node or the frontend hot path.
- Generated C++ accessors and verifier.
- A bounded, zero-allocation TypeScript reader in a Web Worker, revalidated in a real browser before the frontend data plane is accepted.
- FlatBuffers remains isolated from parser domain types behind codec interfaces.

Rationale:

- It is materially faster for the hot summary encode workload.
- Its size overhead is negligible with the selected schema shape.
- Large-message decode performance is equivalent.
- Schema evolution, generated C++ accessors, and the verifier reduce long-term compatibility and security risk.
- The custom codec's detail-encode advantage does not justify maintaining a second hand-written wire protocol for an on-demand path.

The custom prototype remains a benchmark reference only. Reconsider it only if a later real-browser or full-parser profile shows a sustained FlatBuffers regression above 20% in an end-to-end bottleneck, not from an isolated microbenchmark.

## Phase 2 Production Revalidation

The first production packet-tree schema retains the Phase 0 layout decision: vectors of fixed structs plus scalar byte arenas, generated C++ verification, and no object-API unpacking. The deterministic synthetic tree contains five nodes, repeated fields, two data sources, two complete packet contributors, and three arenas.

On the Phase 0 Apple M1 Pro environment, a clean Release loop performing reusable FlatBuffers encode, generated verification, semantic validation, and full checksum traversal sustained approximately 2.03 million trees/s for a 624-byte message. C++ and TypeScript traversal checksums match. This synthetic result is a regression guard only; the real Ethernet -> IPv4 -> UDP slice must be benchmarked again.

## Phase 3 Parser Revalidation

The first real fixture is a 47-byte Ethernet II / IPv4 / UDP frame with a five-byte payload. The parser materializes 27 field nodes and stores packet-backed byte fields as source references rather than duplicating them in the value arena. The parser and encoder recycle capacities between iterations.

On the same Apple M1 Pro environment in a clean Release build:

- Parse only: approximately 1.43 million packets/s.
- Parse + FlatBuffers encode + verify + full traversal: approximately 673,000 packets/s.
- Parser allocations after warm-up: 0 allocations and 0 allocated bytes per packet.
- Codec-only synthetic tree recheck: approximately 2.83 million encode + verify + traversal operations/s for 624 bytes, with no Phase 2 regression.

These figures establish the Phase 4 regression baseline. They are synthetic single-frame measurements, not a 10 Gbit/s claim; mixed-size captures and summary-only parsing remain required before throughput capacity is finalized.

## Phase 4 Dissector Revalidation

Phase 4 routes the unchanged 47-byte fixture through four immutable function-pointer handles: frame, Ethernet, IPv4, and UDP. Initial non-LTO measurements exposed the expected cross-translation-unit dispatch cost and triggered the performance gate. Release interprocedural optimization is now enabled when supported so the modular architecture does not require sacrificing hot-path throughput.

On the same Apple M1 Pro environment in a clean Release build with IPO:

- Parse only: approximately 1.64 million packets/s.
- Parse + FlatBuffers encode + verify + full traversal: approximately 752,000 packets/s.
- Parser allocations after warm-up: 0 allocations and 0 allocated bytes per packet.
- The Phase 3 fixture still materializes exactly 27 nodes; registry-only additions change the registry revision but not its node layout.

These figures clear the Phase 4 5% regression gate. VLAN and TCP correctness are covered by parser and integration tests; a statistically representative mixed-protocol benchmark remains necessary before capacity planning.
