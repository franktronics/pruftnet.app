# Architecture

## Monorepo structure and runtime boundaries

### Package layout

```
apps/
  web/        Express server — serves frontend, loads C++ addon
  desktop/    Electron wrapper — main process loads C++ addon

packages/
  core-cpp/   Native C++ module (packet capture, parsing, injection)
  core-node/  Node.js backend logic (tRPC procedures, workflow orchestrator, SQLite)
  front/      React frontend (shared by web and desktop)
  ui/         Shadcn UI component library
  utils/      Shared types, host analyzer, custom tRPC implementation
```

### Runtime boundaries

```
C++ addon (.node)
  └── loaded by Node.js via N-API
        ├── apps/web  → ExpressJS + WebSocket server
        └── apps/desktop → Electron main process
                              └── IPC to renderer (same React frontend)
```

Both `apps/web` and `apps/desktop` run the same backend logic from `packages/core-node`. The only difference is the transport layer: WebSocket (web) vs Electron IPC (desktop).

### Data flow during capture

```
Network interface
  → C++ (AF_PACKET raw socket, ring buffer)
  → C++ parser (JSON protocol definitions in core-node/assets/protocols/)
  → Node.js backend (host analyzer runs checks)
  → WebSocket / IPC
  → React frontend (packet table + network graph updated live)
```

### Persistence

SQLite (via `better-sqlite3`) stores:
- Application settings
- User-created analysis workflows

Captured packets are **not** persisted — kept in memory and streamed to the frontend only.

### C++ ↔ Node.js bridge

N-API (`packages/core-cpp/src/cpp/main.cpp`) registers C++ classes as Node.js-callable objects. TypeScript wrappers in `packages/core-cpp/src/ts/` provide typed interfaces over the addon.

### Communication layer

A custom tRPC-like module (in `packages/utils`) provides a unified API over all three transports (HTTP, WebSocket, IPC). See @.agents/doc/workflow-system.md for procedure types.
