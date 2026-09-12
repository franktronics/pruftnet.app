# Pruftnet

Cross-platform network analysis software. **Beta, new generation starting at 0.2.0.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/preview-dark.png">
  <source media="(prefers-color-scheme: light)" srcset=".github/assets/preview-light.png">
  <img alt="Pruftnet packet inspection workspace" src=".github/preview-light.png">
</picture>

## Install

Download Desktop installers or standalone Server archives from [Releases](https://github.com/franktronics/pruftnet.app/releases).

- Desktop and Server: macOS 15+ Intel/Apple Silicon, Windows x64, Linux x64/ARM64.
- Linux packages target Ubuntu 24.04+ or Debian 13+. Other distributions need compatible glibc, C++ runtime, and libpcap.
- Server archives include Node. Extract the whole archive, run `./pruftnet serve` (Windows: `pruftnet.cmd serve`), then open http://127.0.0.1:3000.
- Nightly uses `pruftnet-nightly`, port 3001, and separate installation and data directories.

Server binds only to localhost. Use `--help`, `--version`, `--port`, or `--data-dir` as needed. Desktop and Server databases are separate; an explicit `--data-dir` or `PRUFTNET_DATA_DIR` is not migrated automatically.

### Capture permissions

macOS builds are ad hoc signed and not notarized. If Gatekeeper blocks the app, first attempt to open it, then choose **Open Anyway** in System Settings > Privacy & Security. Do not disable Gatekeeper globally. Live capture needs access to `/dev/bpf*`; a Wireshark ChmodBPF installation provides this. Otherwise an administrator may temporarily run:

```sh
sudo chown "$USER" /dev/bpf*
```

On Windows, install [Npcap](https://npcap.com/#download) before starting Pruftnet. It is not bundled. Installers are currently unsigned and Windows may show a publisher warning.

For Linux live capture, grant capabilities only to the installed native worker, never to the desktop or server process:

```sh
sudo setcap cap_net_raw,cap_net_admin=eip /opt/pruftnet-server/app/native/pruftnet_capture_worker
```

The desktop worker is under `/opt/Pruftnet/resources/native/`; repeat the capability grant after upgrades. AppImage cannot retain file capabilities, so use the Debian package for live capture. Do not run Pruftnet as root.

### Package managers

After the first repository publication, install on macOS with:

```sh
brew install --cask franktronics/pruftnet/pruftnet-desktop
brew install franktronics/pruftnet/pruftnet-server
```

On Ubuntu or Debian, configure the signed APT repository once:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://franktronics.github.io/pruftnet.app/pruftnet.asc | sudo tee /etc/apt/keyrings/pruftnet.asc >/dev/null
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/pruftnet.asc] https://franktronics.github.io/pruftnet.app main main' | sudo tee /etc/apt/sources.list.d/pruftnet.list
sudo apt update
sudo apt install pruftnet-desktop pruftnet-server
```

Append `-nightly` to package names for nightly. Homebrew is macOS only. In-app auto-update is not available yet.

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
