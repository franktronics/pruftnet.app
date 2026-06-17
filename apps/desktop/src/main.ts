import { app, BrowserWindow } from "electron"
import type { Event as ElectronEvent } from "electron"
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { loadServerConfig, startServer } from "@repo/server"

const serverConfig = loadServerConfig({
  host: "127.0.0.1",
})
const frontendUrl = `http://${serverConfig.host}:${serverConfig.port}`
const frontendOrigin = new URL(frontendUrl).origin

function isAllowedNavigation(navigationUrl: string) {
  try {
    const url = new URL(navigationUrl)
    return url.origin === frontendOrigin
  } catch {
    return false
  }
}

function protectWindowNavigation(window: BrowserWindow) {
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

const createMainWindow = Effect.gen(function* () {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Pruftnet",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  protectWindowNavigation(window)
  yield* Effect.promise(() => window.loadURL(frontendUrl))
})

const program = Effect.gen(function* () {
  const server = yield* startServer(serverConfig)
  yield* Effect.log(`Desktop backend listening on ${server.address}`)

  yield* Effect.promise(() => app.whenReady())
  yield* createMainWindow

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void Effect.runPromise(createMainWindow)
    }
  })

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit()
    }
  })
})

NodeRuntime.runMain(Effect.scoped(program))
