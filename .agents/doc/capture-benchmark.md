# Capture Pipeline Benchmark Snapshot

Date: 2026-07-13. Host: Apple M1 Pro, arm64, macOS 27.0. Compiler: Apple system C++20 compiler. CMake build type was unset, so these are development-build diagnostics, not Release performance claims.

Command:

```bash
/usr/bin/time -l packages/core/cpp/build/sniffing_runtime_benchmark
```

Results:

| Scenario | Packet rate | Payload throughput | Queue high-water | Drops | Commit latency avg / p99 | Write amplification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Queue, 64-byte packets, 1,000,000 iterations | 12.98 Mpps | 830.6 MB/s | 2,048 packets | 0 | n/a | n/a |
| Queue, 1,514-byte packets, 250,000 iterations | 8.87 Mpps | 13.43 GB/s | 2,048 packets | 0 | n/a | n/a |
| pcapng spool, 64-byte packets, 100,000 packets | 208.2 kpps | 13.32 MB/s | n/a | 0 | 38.29 ms / 76.26 ms | 2.125x |
| pcapng spool, 1,514-byte packets, 20,000 packets | 49.0 kpps | 74.14 MB/s | n/a | 0 | 7.23 ms / 15.20 ms | 1.049x |
| Full two-interface fake-source runtime, 100,000 96-byte packets | 29.1 kpps analyzed | 2.79 MB/s payload | 97,402 packets / 9,350,592 bytes aggregate per-interface maxima | 0 queue drops | included in end-to-end duration | pcapng included |

The full runtime finished with `packetsPersisted=100000`, `packetsAnalyzed=100000`, and `analysisBacklog=0`.

Process totals for the complete benchmark run were 4.66 seconds wall, 2.91 seconds user CPU, 1.83 seconds system CPU, and 78,430,208 bytes maximum resident set size. The combined CPU time is approximately one fully utilized core; individual scenario CPU and peak memory are not isolated by this harness.

The high small-packet pcapng amplification is expected because each Enhanced Packet Block includes fixed headers, alignment, packet identity options, and duplicated block length. Controlled 1 MiB flush batches explain the observed commit-latency distribution. Lower flush thresholds reduce latency at the cost of more flush calls; they do not issue per-packet `fsync`.

No before/after benchmark with the removed parser-first runtime was captured under identical source and build conditions, so this report makes no speedup claim. Release builds, target filesystems, Windows/Npcap, Linux, long-duration soak, summary batch encoding, and isolated detail-generation benchmarks remain required before setting production throughput defaults.
