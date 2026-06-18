import { BrowserWindow } from "electron"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { protectWindowNavigation } from "./window-navigation.js"

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function getPreloadPath() {
  return join(currentDirectory, "preload.js")
}

export async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Pruftnet",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#737373",
      height: 48,
    },
    trafficLightPosition: { x: 16, y: 14 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
      sandbox: false,
    },
  })

  protectWindowNavigation(window)

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    await window.loadFile(
      join(currentDirectory, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    )
  }

  return window
}
