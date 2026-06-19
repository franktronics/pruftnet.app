import { spawn } from "node:child_process"

import { desktopDir, resolveElectronLaunchCommand } from "./electron-runtime.mjs"

const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
delete childEnv.VITE_DEV_SERVER_URL

const electronCommand = resolveElectronLaunchCommand(["dist-electron/main/main.js"])
const child = spawn(electronCommand.electronPath, electronCommand.args, {
  cwd: desktopDir,
  env: childEnv,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
