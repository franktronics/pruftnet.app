# Prüftnet

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
- **Build**: pnpm workspaces, Turborepo, CMake

## Prerequisites

- Node.js >= 18
- pnpm >= 10
- CMake (for C++ build)
- sudo privileges (for packet capture: `CAP_NET_RAW`, `CAP_NET_ADMIN`)

## Installation

```bash
# Install dependencies
pnpm install

# Build C++ native modules
pnpm build:core

# Initialize database
pnpm db:init
```

## Development

```bash
# Start web app
pnpm dev:web

# Start desktop app
pnpm dev:desktop

# Run tests
pnpm test

# Format code
pnpm format
```

## Project Structure

```
packages/
├── core-cpp      # C++ network analysis with N-API bindings
├── core-node     # Node.js backend with tRPC controllers
├── front         # React frontend (shared by web/desktop)
├── ui            # Shadcn UI components
└── utils         # Shared utilities + tRPC implementation

apps/
├── web           # Express server + static frontend
└── desktop       # Electron wrapper
```

## Documentation

- [Network Protocols](https://www.rfc-editor.org/)
- [React](https://react.dev/reference/react)
- [TypeScript](https://www.typescriptlang.org/docs/)

## License

MIT
