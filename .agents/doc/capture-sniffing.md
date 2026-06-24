# C++ Capture Sniffing

The standalone capture prototype lives in `packages/core/cpp`.

The current implementation uses libpcap/Npcap for portable layer-2 packet capture, then moves packets through an application-owned bounded SPSC ring before invoking a parser stub. The parser is intentionally empty for now and only prints raw packet metadata/bytes.

Important defaults:

- CMake-based C++20 project.
- `pcap_create()` configuration path, not `pcap_open_live()`.
- `snaplen` defaults to 512 bytes.
- pcap buffer defaults to 64 MiB.
- application ring defaults to 65,536 slots.
- accepted link types are `DLT_EN10MB`, `DLT_LINUX_SLL`, `DLT_LINUX_SLL2`, `DLT_RAW`, `DLT_NULL`, and `DLT_LOOP` when available.
- unsupported link types fail at startup by default.
- application ring overload drops newest packets and increments structured stats.

Future Node/server integration should not transform packet data into JS objects. The intended direction is a separate C++ capture process exposing a shared-memory ring to the Node core.
