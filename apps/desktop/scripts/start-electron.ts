import { spawn } from "node:child_process"
import * as NodeOS from "node:os"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-runtime.ts"

const shouldUseShell = NodeOS.platform() === "win32"
const childEnv: NodeJS.ProcessEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.VITE_DEV_SERVER_URL

const electronCommand = resolveElectronLaunchCommand(["dist-electron/main/main.js"])
const child = spawn(electronCommand.electronPath, electronCommand.args, {
  cwd: desktopDir,
  env: childEnv,
  shell: shouldUseShell,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
