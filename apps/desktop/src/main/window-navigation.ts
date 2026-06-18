import type { BrowserWindow, Event as ElectronEvent } from "electron"

function isAllowedNavigation(navigationUrl: string) {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return navigationUrl.startsWith("file://")
  }

  try {
    const url = new URL(navigationUrl)
    return url.origin === new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
  } catch {
    return false
  }
}

export function protectWindowNavigation(window: BrowserWindow) {
  window.webContents.on(
    "will-navigate",
    (event: ElectronEvent, navigationUrl: string) => {
      if (!isAllowedNavigation(navigationUrl)) {
        event.preventDefault()
      }
    }
  )

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
}
