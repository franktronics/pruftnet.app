import { spawn, spawnSync } from "node:child_process"
import { watch } from "node:fs"
import * as NodeOS from "node:os"
import { join } from "node:path"

import {
  desktopDir,
  killChildTreeByPid,
  resolveElectronLaunchCommand,
} from "./electron-runtime.mjs"
import { waitForResources } from "./wait-for-resources.mjs"

const devServerUrl = process.env.VITE_DEV_SERVER_URL?.trim()
if (!devServerUrl) {
  throw new Error("VITE_DEV_SERVER_URL is required for desktop development.")
}

const devServer = new URL(devServerUrl)
const port = Number.parseInt(devServer.port, 10)
if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`VITE_DEV_SERVER_URL must include an explicit port: ${devServerUrl}`)
}

const requiredFiles = ["dist-electron/main/main.js", "dist-electron/preload/preload.js"]
const watchedDirectories = [
  { directory: "dist-electron/main", files: new Set(["main.js"]) },
  { directory: "dist-electron/preload", files: new Set(["preload.js"]) },
]
const forcedShutdownTimeoutMs = 1_500
const restartDebounceMs = 120
const childTreeGracePeriodMs = 1_200
const remoteDebuggingPort = process.env.PRUFTNET_DESKTOP_REMOTE_DEBUGGING_PORT?.trim()
const hostPlatform = NodeOS.platform()

await waitForResources({
  baseDir: desktopDir,
  files: requiredFiles,
  tcpHost: devServer.hostname,
  tcpPort: port,
})

const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE

let shuttingDown = false
let restartTimer = null
let currentApp = null
let restartQueue = Promise.resolve()
const expectedExits = new WeakSet()
const watchers = []

function cleanupStaleDevApps() {
  if (hostPlatform === "win32") {
    return
  }

  spawnSync("pkill", ["-f", "--", `--pruftnet-dev-root=${desktopDir}`], { stdio: "ignore" })
}

function startApp() {
  if (shuttingDown || currentApp !== null) {
    return
  }

  const electronArgs = remoteDebuggingPort ? [`--remote-debugging-port=${remoteDebuggingPort}`] : []
  const launchArgs = [
    ...electronArgs,
    `--pruftnet-dev-root=${desktopDir}`,
    "dist-electron/main/main.js",
  ]
  const electronCommand = resolveElectronLaunchCommand(launchArgs)
  const app = spawn(electronCommand.electronPath, electronCommand.args, {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  })

  currentApp = app

  app.once("error", () => {
    if (currentApp === app) {
      currentApp = null
    }

    if (!shuttingDown) {
      scheduleRestart()
    }
  })

  app.once("exit", (code, signal) => {
    if (currentApp === app) {
      currentApp = null
    }

    const exitedAbnormally = signal !== null || code !== 0
    if (!shuttingDown && !expectedExits.has(app) && exitedAbnormally) {
      scheduleRestart()
    }
  })
}

async function stopApp() {
  const app = currentApp
  if (!app) {
    return
  }

  currentApp = null
  expectedExits.add(app)

  await new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      resolve()
    }

    app.once("exit", finish)
    app.kill("SIGTERM")
    killChildTreeByPid(app.pid, "SIGTERM")
    cleanupStaleDevApps()

    setTimeout(() => {
      if (settled) {
        return
      }

      app.kill("SIGKILL")
      killChildTreeByPid(app.pid, "SIGKILL")
      cleanupStaleDevApps()
      finish()
    }, forcedShutdownTimeoutMs).unref()
  })
}

function scheduleRestart() {
  if (shuttingDown) {
    return
  }

  if (restartTimer) {
    clearTimeout(restartTimer)
  }

  restartTimer = setTimeout(() => {
    restartTimer = null
    restartQueue = restartQueue
      .catch(() => undefined)
      .then(async () => {
        await stopApp()
        if (!shuttingDown) {
          startApp()
        }
      })
  }, restartDebounceMs)
}

function startWatchers() {
  for (const { directory, files } of watchedDirectories) {
    const watcher = watch(
      join(desktopDir, directory),
      { persistent: true },
      (_eventType, filename) => {
        if (typeof filename !== "string" || !files.has(filename)) {
          return
        }

        scheduleRestart()
      },
    )

    watchers.push(watcher)
  }
}

function killChildTree(signal) {
  if (hostPlatform === "win32") {
    return
  }

  spawnSync("pkill", [`-${signal.replace(/^SIG/, "")}`, "-P", String(process.pid)], {
    stdio: "ignore",
  })
}

async function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true

  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }

  for (const watcher of watchers) {
    watcher.close()
  }

  await stopApp()
  killChildTree("SIGTERM")
  await new Promise((resolve) => {
    setTimeout(resolve, childTreeGracePeriodMs)
  })
  killChildTree("SIGKILL")

  process.exit(exitCode)
}

startWatchers()
cleanupStaleDevApps()
startApp()

process.once("SIGINT", () => {
  void shutdown(130)
})
process.once("SIGTERM", () => {
  void shutdown(143)
})
process.once("SIGHUP", () => {
  void shutdown(129)
})
