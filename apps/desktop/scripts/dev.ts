import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import * as NodeOS from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const hostPlatform = NodeOS.platform()
const scriptsDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptsDir, "..")
const pnpmCommand = hostPlatform === "win32" ? "pnpm.cmd" : "pnpm"
const rendererHost = process.env.PRUFTNET_DESKTOP_DEV_HOST?.trim() || "127.0.0.1"
const rendererPort = Number.parseInt(process.env.PRUFTNET_DESKTOP_DEV_PORT ?? "5173", 10)

if (!Number.isInteger(rendererPort) || rendererPort <= 0 || rendererPort > 65535) {
  throw new Error("PRUFTNET_DESKTOP_DEV_PORT must be a valid TCP port.")
}

function formatHostForUrl(host: string) {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1"
  }

  if (host.includes(":") && !host.startsWith("[")) {
    return `[${host}]`
  }

  return host
}

const devServerUrl = `http://${formatHostForUrl(rendererHost)}:${rendererPort}/`
const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  VITE_DEV_SERVER_URL: devServerUrl,
}

const children: ChildProcess[] = []
let shuttingDown = false

function spawnChild(label: string, command: string, args: readonly string[]) {
  const child = spawn(command, args, {
    cwd: desktopDir,
    env: childEnv,
    stdio: "inherit",
  })

  children.push(child)
  child.once("exit", (code, signal) => {
    if (shuttingDown) {
      return
    }

    const exitCode = signal ? 1 : (code ?? 0)
    console.error(`[desktop-dev] ${label} exited unexpectedly.`)
    void shutdown(exitCode === 0 ? 1 : exitCode)
  })

  child.once("error", (error) => {
    if (shuttingDown) {
      return
    }

    console.error(`[desktop-dev] ${label} failed to start.`, error)
    void shutdown(1)
  })

  return child
}

function killChild(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  if (hostPlatform === "win32") {
    if (typeof child.pid === "number") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    }
    return
  }

  child.kill(signal)
  if (typeof child.pid === "number") {
    spawnSync("pkill", [`-${signal.replace(/^SIG/, "")}`, "-P", String(child.pid)], {
      stdio: "ignore",
    })
  }
}

async function shutdown(exitCode: number) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  for (const child of children) {
    killChild(child, "SIGTERM")
  }

  await new Promise<void>((resolveShutdown) => {
    setTimeout(resolveShutdown, 1_200)
  })

  for (const child of children) {
    killChild(child, "SIGKILL")
  }

  process.exit(exitCode)
}

spawnChild("renderer dev server", pnpmCommand, [
  "exec",
  "vite",
  "--config",
  "config/vite.renderer.config.ts",
  "--host",
  rendererHost,
  "--port",
  String(rendererPort),
  "--strictPort",
])
spawnChild("main process watcher", pnpmCommand, [
  "exec",
  "vite",
  "build",
  "--config",
  "config/vite.main.config.ts",
  "--watch",
])
spawnChild("preload watcher", pnpmCommand, [
  "exec",
  "vite",
  "build",
  "--config",
  "config/vite.preload.config.ts",
  "--watch",
])
spawnChild("electron launcher", pnpmCommand, ["exec", "tsx", "scripts/dev-electron.ts"])

process.once("SIGINT", () => {
  void shutdown(130)
})
process.once("SIGTERM", () => {
  void shutdown(143)
})
process.once("SIGHUP", () => {
  void shutdown(129)
})
