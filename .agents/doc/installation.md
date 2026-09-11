# Installation (beta)

Desktop and Server run on macOS Intel/Apple Silicon, Windows x64, and Linux x64/ARM64.
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

The release workflow updates the Homebrew tap and signed APT repository after all target builds pass. Installation commands are published with each release. APT requires adding the repository and its scoped signing key once. Package managers provide updates; in-app auto-update is deferred.

Server archive users must retain the full directory when upgrading and stop the old process first. Persistent data is outside the installation directory.
