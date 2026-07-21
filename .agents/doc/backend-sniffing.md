# Backend Capture Service

The canonical capture architecture, failure model, statistics, retention, and shutdown semantics are documented in [capture-architecture.md](capture-architecture.md). The pre-migration implementation is preserved only as a historical regression baseline in [capture-pipeline-current.md](capture-pipeline-current.md).

`packages/core` owns the Effect service used by server and desktop layers. The service supervises `pruftnet_capture_worker`, keeps lifecycle handlers thin, validates complete 128-bit capture identities, and maps expected native failures into shared schema-backed errors. It does not use `Effect.runPromise` inside domain services.

Effect RPC is the control/query plane for lifecycle, interfaces, capabilities, sessions, summaries,
registry, statistics, and events. The same HTTP/NDJSON protocol exposes a bounded application stream
and a capture-scoped stream; SQLite and cursor queries remain authoritative. The backend supervisor,
not connected clients, is the sole native summary/event journal drainer. Selected packet detail uses
the binary HTTP route:

```text
GET /capture/:captureId/packets/:packetId
Content-Type: application/vnd.pruftnet.packet-tree
```

Expected statuses are `200` ready, `404` unknown, `410` intentionally evicted, `422` corrupt or failed analysis, `425` analysis pending, and `503` worker unavailable. Registry and analysis revisions are carried as query parameters and validated by the worker.

Worker protocol version 2 is length-framed, request-ID correlated, bounded, and cancellation-safe. Late responses are drained after timeout or caller cancellation. Packet trees are transferred as binary files, never Base64 JSON. A dedicated native detail executor prevents detail queues from blocking control and summary commands.

`PRUFTNET_CAPTURE_WORKER_PATH` selects the worker executable. `PRUFTNET_REPLAY_FILES` maps opaque replay IDs to trusted absolute pcap paths. Only one capture session is active per backend worker.
