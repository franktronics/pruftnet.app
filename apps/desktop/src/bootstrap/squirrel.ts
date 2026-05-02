import { createRequire } from 'node:module'
import { app } from 'electron'

/**
 * Handles Squirrel.Windows install/uninstall events.
 * Must be called before app.whenReady() — quits immediately if a Squirrel
 * event is detected so the installer can proceed without opening a window.
 *
 * Uses createRequire so the CJS module is resolved at runtime from node_modules
 * inside the asar, avoiding Rolldown bundling issues with require() calls.
 */
export function handleSquirrelEvents(): void {
    if (process.platform !== 'win32') return

    const _require = createRequire(import.meta.url)

    // electron-squirrel-startup handles --squirrel-install, --squirrel-updated,
    // --squirrel-uninstall, --squirrel-obsolete events and returns true if one
    // of those events was the reason the app was launched.
    const started: boolean = _require('electron-squirrel-startup')
    if (started) app.quit()
}
