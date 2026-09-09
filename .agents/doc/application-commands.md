# Application Commands

Pruftnet uses one command catalogue for the Electron application menu, application shortcuts, the
web command palette, and the keyboard-shortcut reference in Settings.

## Architecture

- `packages/shared/src/modules/app-command/` defines stable command identifiers, user-facing
  metadata, portable shortcuts, IPC state types, and runtime validation.
- `packages/front/src/commands/application-command-provider.tsx` owns renderer handlers and command
  availability. React is the source of truth for application state.
- `apps/desktop/src/main/application-menu.ts` owns the native Electron menu. It receives only a
  validated state snapshot and sends command identifiers back to the focused renderer.
- `apps/desktop/src/preload.ts` exposes the narrow command bridge. Renderer code never receives
  Electron IPC objects.

Electron roles own standard editing, zoom, fullscreen, window, and application actions. They must
not be reimplemented in React.

## Platform behavior

- macOS uses the permanent system application menu and native application/window roles.
- Windows and Linux use Electron's native menu with `autoHideMenuBar`; pressing `Alt` reveals it.
- Web builds expose application shortcuts and the command palette, but no simulated system menu.
- `Mod` in the shared catalogue means Command on macOS and Control elsewhere.

Application accelerators are local to a focused Pruftnet window. Do not use Electron
`globalShortcut` for these commands.

## State and execution

Components register a handler and publish `enabled`, `pending`, an optional dynamic `label`, and an
optional `disabledReason`. Commands are disabled until a renderer publishes its first snapshot.

The native menu state is advisory. The renderer checks availability again immediately before every
execution, and backend operations retain their own correctness checks. Application commands are
temporarily disabled while a blocking dialog is open. Destructive actions require an explicit
confirmation and do not receive accelerators.

Start and Stop are separate renderer commands with the shared `Mod+E` shortcut. The native menu
presents them as one dynamic item so only the action valid for the current capture state can run.

## Adding a command

1. Add its identifier and metadata to `@repo/shared/app-command`.
2. Register its renderer handler at the narrowest component that owns the required state.
3. Add it to the native menu only if it belongs in a conventional system menu.
4. Add a shortcut only when it is discoverable, conflict-free, and uses a modifier.
5. Provide a concise reason whenever the command can be disabled.
6. Add tests for catalogue validation, shortcut formatting, and state transitions as applicable.

The command palette automatically includes catalogue commands other than itself. The Settings
reference automatically includes commands with shortcuts.

## Accessibility checklist

- Keep unavailable commands visible and explain why they are disabled.
- Preserve focus when the command palette closes.
- Do not intercept unmodified typing, arrows, Space, or Escape globally.
- Keep editing shortcuts under native Electron roles.
- Announce failed or stale command invocations through the application live region.
- Use explicit destructive labels such as “Stop and Discard Current Capture”; never hide deletion
  behind “New Capture”.

## Manual platform checks

### macOS

- Verify the Pruftnet, File, Edit, Capture, Go, View, Window, and Help menus.
- Verify Command shortcuts and dynamic Start/Stop state.
- Verify Services, Hide, Full Screen, Close, and Quit roles.

### Windows and Linux

- Verify that the menu is hidden by default and revealed with `Alt`.
- Verify Control shortcuts while the menu is hidden.
- Verify native editing, zoom, fullscreen, close, and quit behavior.
- Verify that the title-bar window controls remain unobstructed.

### Web

- Verify application shortcuts and the command palette.
- Verify that no desktop-only menu UI is rendered.
