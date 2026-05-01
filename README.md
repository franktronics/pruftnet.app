# Prüftnet

![Preview](https://pruftnet.app/analysis.jpeg)

Network analysis tool with visual workflow builder, packet injection, and real-time analysis.

## Features

- **Visual Workflow Builder** - Create network analysis workflows with React Flow
- **Packet Injection** - Native C++ packet injectors with N-API bindings
- **Real-time Analysis** - WebSocket streaming for live results
- **Cross-platform** - Web app and Electron desktop wrapper

## Tech Stack

- **Frontend**: React, React Flow, Tailwind CSS, Shadcn UI
- **Backend**: Node.js, Express, Custom tRPC-like implementation
- **Native**: C++ with N-API bindings for packet capture/injection
- **Database**: SQLite via Drizzle ORM (migrations applied automatically at startup)
- **Build**: pnpm workspaces, CMake, Electron Forge

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- CMake (for C++ build)
- sudo privileges (for packet capture: `CAP_NET_RAW`, `CAP_NET_ADMIN`)

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build the C++ native addon

```bash
pnpm build:core
```

This compiles the C++ packet capture/injection code into a `.node` binary loaded at runtime.

### 3. Grant capture capabilities (Linux/macOS)

```bash
# macOS / Linux — grant CAP_NET_RAW and CAP_NET_ADMIN to node
pnpm setup:caps
```

> On macOS you may need to run the app with `sudo` instead.

---

## Development

### Web mode

Starts an Express server + Vite HMR. Open `http://localhost:5173` in your browser.

```bash
pnpm dev:web
```

### Desktop mode

Starts the Electron app with hot reload.

```bash
pnpm dev:desktop
```

> Both modes apply DB migrations automatically on first run — no manual DB setup needed.

---

## Build for Production

### Desktop app (Electron)

Produces a `.app` (macOS), `.exe` (Windows), or `.deb` (Linux) in `apps/desktop/out/`.

```bash
pnpm build:desktop
```

### Web server

Bundles the Express server + frontend for deployment.

```bash
pnpm build:server
```

---

## Other Commands

```bash
pnpm typecheck       # TypeScript type checking across all packages
pnpm format          # Format all files with Prettier
pnpm test            # Run C++ tests (Catch2)
pnpm db:generate     # Generate Drizzle SQL migrations after schema changes
pnpm db:migrate      # Apply migrations to dev.db manually (auto-runs on startup)
```

---

## Project Structure

```
apps/
├── web/          Express server — serves frontend, loads C++ addon
└── desktop/      Electron wrapper — main process loads C++ addon

packages/
├── core-cpp/     Native C++ module (packet capture, parsing, injection)
├── core-node/    Node.js backend (tRPC procedures, Drizzle ORM, SQLite)
├── front/        React frontend (shared by web and desktop)
├── ui/           Shadcn UI component library
└── utils/        Shared types, host analyzer, custom tRPC implementation
```

---

## License

MIT
