# Application Commands

One shared catalogue powers the Electron menu, command palette, shortcuts, and
Settings reference. Definitions and validation live in
`packages/shared/src/modules/app-command/`. The renderer registers handlers and
availability through `ApplicationCommandProvider`. The Electron main process
receives a validated state snapshot and returns command IDs through the narrow
preload bridge. Renderer state is authoritative.

Use native Electron roles for editing, zoom, fullscreen, window, and
application actions. Do not reimplement them in React or use global shortcuts.
`Mod` means Command on macOS and Control elsewhere. Web exposes palette and
shortcuts but never a simulated system menu.

## Adding a command

1. Add stable metadata to `@repo/shared/app-command`.
2. Register a renderer handler at the component that owns its state.
3. Publish `enabled`, `pending`, dynamic label, and disabled reason.
4. Add a native menu entry only for a conventional system menu action.
5. Add a shortcut only when it is conflict-free and modifier based.

The renderer checks availability again before execution. Backend operations
retain their own correctness checks. Destructive actions require confirmation
and have no accelerator. Keep unavailable commands visible with a short reason,
preserve focus when the palette closes, and do not globally intercept typing or
unmodified navigation keys.
