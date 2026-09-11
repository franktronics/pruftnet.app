# Installation (beta)

Desktop and Server run on macOS 15+ Intel/Apple Silicon, Windows x64, and Linux x64/ARM64.
Linux packages target Ubuntu 24.04+ or Debian 13+. Other distributions need a compatible glibc, C++ runtime and libpcap. No Node.js, pnpm or compiler is required for release archives.

## Downloads

Download an installer or server archive from [GitHub Releases](https://github.com/franktronics/pruftnet.app/releases).
Extract the entire server archive, then run `./pruftnet serve` (Windows: `pruftnet.cmd serve`).
Open http://127.0.0.1:3000. Nightly uses `pruftnet-nightly` and port 3001.
Use `--help`, `--version`, `--port` or `--data-dir`. The server only binds to localhost.

Desktop and Server have separate databases. Main and nightly also have separate names, commands and data directories. Explicit `--data-dir`/`PRUFTNET_DATA_DIR` overrides are the user's responsibility. There is no automatic migration from the old application.

## macOS

Initial builds are ad-hoc signed, without Apple Developer ID or notarization. Gatekeeper may block them. After attempting to open the downloaded application, use System Settings > Privacy & Security > Open Anyway for this application. Do not disable Gatekeeper globally. Managed Macs may prohibit this exception.

Live capture needs access to `/dev/bpf*`. An existing Wireshark ChmodBPF installation provides this. Otherwise an administrator can temporarily grant the current user access until reboot:

```sh
sudo chown "$USER" /dev/bpf*
```

The app itself must run as a normal user. Persistent permission setup is not installed silently.

## Windows

Install [Npcap](https://npcap.com/#download) before starting Pruftnet. Npcap is not bundled or redistributed. Its installer and license are provided by its publisher. Current Pruftnet installers are unsigned and Windows may warn about the publisher.

## Linux capture permissions

For live capture, grant capabilities only to the installed native worker. For the server Debian package:

```sh
sudo setcap cap_net_raw,cap_net_admin=eip /opt/pruftnet-server/app/native/pruftnet_capture_worker
```

For desktop, the worker is under `/opt/Pruftnet/resources/native/`. Nightly uses its own installation path. Repeat after upgrades. Restrict executable access to a trusted capture group where appropriate. Never run the Electron app as root. AppImage's read-only mount cannot retain file capabilities; use the Debian/RPM package for live capture.

## Package managers

After the first successful repository publication, install on macOS with:

```sh
brew install --cask franktronics/pruftnet/pruftnet-desktop
brew install franktronics/pruftnet/pruftnet-server
```

On Ubuntu 24.04+ or Debian 13+, add the signed APT repository once:

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://franktronics.github.io/pruftnet.app/pruftnet.asc | sudo tee /etc/apt/keyrings/pruftnet.asc >/dev/null
printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/pruftnet.asc] https://franktronics.github.io/pruftnet.app main main' | sudo tee /etc/apt/sources.list.d/pruftnet.list
sudo apt update
sudo apt install pruftnet-desktop pruftnet-server
```

For nightly, append `-nightly` to package names. For APT also add an equivalent repository line using `nightly main` instead of `main main`. Both channels can coexist. Homebrew support is macOS only; Linux binaries require the system libpcap ABI from the supported Debian/Ubuntu releases. RPM artifacts are experimental and are not installation-tested on RPM distributions.

Package managers provide updates; in-app auto-update is deferred.

Server archive users must retain the full directory when upgrading and stop the old process first. Persistent data is outside the installation directory.
