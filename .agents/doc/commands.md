# Commands

## Available commands and what they do

### Setup

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies across the monorepo |
| `pnpm setup` | Build `better-sqlite3` for Node + Electron and cache both binaries. Re-run when switching Node versions. |
| `pnpm setup --build-node` | Build `better-sqlite3` for Node only (used in CI server builds) |
| `pnpm setup --build-electron` | Build `better-sqlite3` for Electron only (used in CI desktop builds) |
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

### Build

| Command | Description |
|---------|-------------|
| `pnpm build:desktop` | Build + package the Electron desktop app (produces `.app` / `.exe` / `.deb`) |
| `pnpm build:server` | Build the web server for production deployment |

### Database (Drizzle)

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate SQL migration files from schema changes |
| `pnpm db:migrate` | Apply pending migrations to dev.db |

> Migrations are applied **automatically at runtime** on startup (dev and prod). No manual step needed for normal dev workflow.
> Run `pnpm db:generate` after modifying `packages/core-node/src/db/schema.ts`.

### C++ build internals

`pnpm build:core` runs cmake-js which:
1. Reads `packages/core-cpp/CMakeLists.txt`
2. Compiles all `.cpp` sources into a `.node` binary
3. The `.node` file is loaded at runtime by Node.js via `require()`
4. TypeScript type definitions in `packages/core-cpp/src/ts/` wrap the addon
