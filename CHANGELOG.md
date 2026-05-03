# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-05-04

### Fixed

- **Dev mode launcher** (`setup.js`): `--web` and `--desktop` flags now auto-build and cache the `better-sqlite3` binary on first run if the cache directories (`Release-node/`, `Release-electron/`) are missing, instead of crashing with `ENOENT`. Subsequent runs use the cache directly.
- **Root privilege check for network capture**: `new NetworkSniffer()` now throws `"Insufficient privileges: raw sockets require root privileges..."` immediately if the process is not running as root/administrator, instead of silently returning `false` from `startSniffing`. Error propagates to the frontend via the existing `{ type: 'error', message }` tRPC stream event. Added `isSnifferPrivileged()` helper (exported from `@repo/core-cpp`) checking `process.getuid() === 0` on Unix and `IsUserAnAdmin` via PowerShell on Windows.
- **C++ raw socket error propagation**: `PacketCapture::createRawSocket()` now stores a human-readable error in `last_error_` (distinguishing `EPERM`/`EACCES` from other socket errors) instead of logging to `stderr` only. `NetworkSniffer::startSniffing()` propagates `last_error_` up; the NAPI wrapper throws a JavaScript `Error` with that message when `startSniffing` returns `false`.
- **Electron runtime deps externalization** (`forge.config.ts`): added `packageAfterCopy` hook with recursive `copyModuleWithDeps()` to bundle `better-sqlite3` and its transitive runtime dependencies inside the asar archive, fixing `MODULE_NOT_FOUND` errors in packaged Linux `.deb` builds.
- **`electron-squirrel-startup` CJS/ESM incompatibility**: removed from Vite externals; moved Squirrel event handling into `apps/desktop/src/bootstrap/squirrel.ts` using `createRequire` behind a Windows platform guard, fixing startup crash on Windows builds under Vite 8 / Rolldown.

## [0.1.1] - 2026-05-02

### Changed

- Migrated ORM from Prisma to Drizzle ORM (`@repo/core-node`)
- Replaced runtime filesystem-based migrations with inline SQL migrations in `db-config.ts`
- Replaced `dotenv` dependency with native `node:fs` `.env` parsing for ESM compatibility
- Switched TanStack Router to `createHashHistory` in Electron renderer to fix `file://` protocol routing
- Fixed `electron-squirrel-startup` CJS/ESM incompatibility using `createRequire` with Windows guard

### Added

- `pnpm db:generate` and `pnpm db:migrate` commands for Drizzle schema management
- Custom `__migrations` table for tracking applied inline migrations at runtime
- `setup.js` now builds and caches `better-sqlite3` binaries separately for Node and Electron

### Removed

- All Prisma dependencies, schema files, and generated client code
- `dotenv` package dependency from `@repo/core-node`

### Fixed

- Electron packaged `.app` signature invalidated by `FusesPlugin` — re-signed via `postPackage` hook
- `@tanstack/react-query` not found at runtime when app launched outside project directory
- Direct `../../../utils/src/...` imports in `core-node` replaced with proper `@repo/utils` package imports
- `ServerError` now exported directly from `@repo/utils` (previously only accessible via `trpcServer.ServerError`)

## [0.1.0] - 2026-03-17

Initial release of Pruftnet - a network analysis and packet capture application.

### Added

- Real-time packet capture and analysis with C++ core for high performance
- Network host discovery and visualization with interactive network map
- Protocol parsing for Ethernet, IPv4, IPv6, ARP, ICMP, ICMPv6, TCP, UDP, DNS, DHCP, and more
- Analysis workflow builder with visual node-based editor
- Packet injection capabilities (ARP scan, ICMP ping, ICMPv6, IPv6 Router Solicitation)
- Desktop application (Electron) and standalone server modes
- SQLite database for storing analyses and settings
