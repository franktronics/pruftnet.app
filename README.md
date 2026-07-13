# Pruftnet

Network analysis software.

## Requirements

- Node.js 22+
- pnpm 11+

## Development

Install dependencies:

```bash
pnpm install
```

Build the native capture worker required by desktop and server development:

```bash
pnpm build:cpp
```

Run the desktop app in development mode:

```bash
pnpm dev:desktop
```

## RPC Runtime

Shared RPC contracts live in `@repo/shared`. Core implementations live in `@repo/core` and are exposed through `AppLayer`.

- Server mode mounts the core RPC handler at `/rpc`.
- Desktop mode starts a local RPC server on a random `127.0.0.1` port and exposes its URL as `window.pruftnet.rpcUrl` through preload.
- Expected RPC errors should use `Schema.TaggedError` and the shared `BasicErrorFields` model from `@repo/shared/utils` so frontend renderers can display `title`, optional `message`, optional `whatToDo`, `retryable`, and `severity` consistently.

## Build

Build the full Electron desktop app for the current operating system:

```bash
pnpm build
```

Build artifacts are written to `apps/desktop/release`.

Platform outputs:

- macOS: `dmg`, `zip`
- Windows: `nsis` installer
- Linux: `AppImage`, `deb`, `rpm`

Electron desktop packages should be built on their target operating system for best compatibility. GitHub Actions builds each platform on native runners.
