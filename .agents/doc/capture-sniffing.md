# C++ Sniffing Module

The standalone sniffing module lives in `packages/core/cpp`.

The current public API is `pruftnet::sniffing::NetworkSniffer`. It is configured with `SnifferOptions`, started with `start()`, stopped with `stop()`, and emits packets through a user-provided callback.

Current pipeline:

```text
libpcap/Npcap
  -> capture thread
  -> bounded SPSC packet ring
  -> parser thread
  -> empty parser
  -> packet callback(raw packet, parsed packet, stats)
```

Important constraints:

- The capture thread never parses packets.
- The packet callback is called from the parser thread.
- `RawPacketView::bytes` is valid only during the callback.
- Unsupported link types fail at `start()`.
- Application ring overload drops newest packets and increments stats.
- The parser is intentionally empty for now and returns `ParseStatus::NotParsed`.

Default accepted link types are `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, and `DLT_LOOP` when available in local libpcap headers.

Future Node/server integration should use this module from a separate C++ process and expose packet batches through a shared-memory ring rather than converting packet data into JS objects.
