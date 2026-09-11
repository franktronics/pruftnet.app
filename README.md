# Pruftnet

Cross-platform network analysis software. **Beta, new generation starting at 0.2.0.**

## Install

Download Desktop installers or standalone Server archives from [Releases](https://github.com/franktronics/pruftnet.app/releases).

- Desktop: macOS Intel/Apple Silicon, Windows x64, Linux x64/ARM64.
- Server: the same targets, with a bundled Node runtime. Run `pruftnet serve` and open localhost:3000.
- Nightly: separate installation and data, command `pruftnet-nightly`, server port 3001.

See the [installation guide](.agents/doc/installation.md) for Homebrew, APT, capture permissions and unsigned beta installation. In-app auto-update is not available yet.

## Development

Use Node from `.node-version`, pnpm from `package.json`, CMake 3.24+, a C++20 compiler and libpcap development headers (Npcap SDK on Windows).

```sh
pnpm install
pnpm build:cpp
pnpm dev:desktop
# Or:
pnpm dev:server
```

`packages/core` shares the backend and native worker between Electron and the local HTTP server. `packages/front` shares the React interface; `packages/shared` owns RPC contracts.

## Build and release

```sh
pnpm build
```

Both distributions are written to `release/`. Build on each target operating system. The Windows packaging script requires `NPCAP_SDK` to point to the extracted SDK.

Feature PRs target `dev`; merging publishes a nightly after validation. Promote to `main` and push a version tag for a principal release. `dev-archive` preserves the old application. See [release process](.agents/doc/release.md).
