# Native C++ Architecture

## Boundaries

```text
Effect capture service -> framed capture worker -> NetworkSniffer
  -> packet sources and per-interface rings
  -> pcapng spool and packet index
  -> packet parser and immutable dissector catalog
```

`include/pruftnet/` is the public native API. `src/` is private implementation
and `tools/` owns executable protocol and session logic. C++ library code must
not depend on Node, Electron, React, Effect, environment variables, or process
paths. Validate those values in TypeScript and pass typed worker commands.

`pcapng_format.*` owns binary pcapng encoding and recovery. `PcapngSpool` owns
file lifecycle, retention, and commit publication. `PacketIndex` is derived
storage: it may accelerate reads but must never make raw capture fail.
`PacketParser` and the catalog own parsing. The worker owns JSON framing and
session commands, not parser or spool policy.

## Compatibility and invariants

pcapng metadata, `PRT2`, `packet_tree.fbs`, and the framed worker protocol are
compatibility boundaries. Validate untrusted binary input before use.

- Capture callbacks do bounded copy work and never parse.
- One writer owns pcapng output and commit publication.
- Analysis and detail requests cannot block capture or writer progress.
- A committed packet is recoverable from the raw spool.
- Loss, retention eviction, and request cancellation remain distinct states.
- Warm parser execution must not allocate.

## Change and verification guide

Add a native capability through the public header, typed implementation, and an
explicit worker command only when TypeScript needs it. A new option or statistic
also needs validation, worker serialization, shared schema, and UI only if it
is exposed. Add persistence metadata in `pcapng_format.*` with recovery tests.
Follow [parser architecture](parser-architecture.md) for parser work.

Run focused CTest targets during implementation, then `pnpm test:cpp`. Enable
fuzzers or benchmarks when changing their boundary. Parser and capture
performance claims require Release measurements on representative storage and
traffic; development-build numbers are diagnostics only.
