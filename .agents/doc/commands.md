# Commands

## Available commands and what they do

### Setup

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies across the monorepo |
| `pnpm setup` | Rebuild `better-sqlite3`, generate Prisma client, apply DB migrations. Re-run when switching Node versions. |
| `pnpm build:core` | Compile C++ → `.node` addon via CMake + cmake-js, then generate TypeScript types |

> `pnpm dev:web` and `pnpm dev:desktop` automatically restore the correct `better-sqlite3` binary before starting.

### Development

| Command | Description |
|---------|-------------|
| `pnpm dev:web` | Start Express server + Vite HMR (web mode) |
| `pnpm dev:desktop` | Start Electron desktop app with hot reload |
| `pnpm format` | Format all files with Prettier |
| `pnpm typecheck` | Run TypeScript type checking across all TS packages |

### Testing

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all C++ tests (Catch2 framework) |
| `cd packages/core-cpp/tests/build && sudo ./core_tests "[tag]"` | Run a single C++ test by tag, e.g. `"[parser]"`, `"[sniffer]"` |

> Tests require `sudo` because packet capture needs `CAP_NET_RAW` / `CAP_NET_ADMIN`.

### C++ build internals

`pnpm build:core` runs cmake-js which:
1. Reads `packages/core-cpp/CMakeLists.txt`
2. Compiles all `.cpp` sources into a `.node` binary
3. The `.node` file is loaded at runtime by Node.js via `require()`
4. TypeScript type definitions in `packages/core-cpp/src/ts/` wrap the addon
