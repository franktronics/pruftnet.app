import { contextBridge, ipcRenderer } from "electron"

type DesktopTheme = "dark" | "light" | "system"

function readArgumentValue(prefix: string) {
  const argument = process.argv.find((value) => value.startsWith(prefix))
  return argument?.slice(prefix.length)
}

const rpcUrl = readArgumentValue("--pruftnet-rpc-url=")

if (!rpcUrl) {
  throw new Error("Missing desktop RPC URL")
}

contextBridge.exposeInMainWorld("pruftnet", {
  platform: process.platform,
  rpcUrl,
  setTheme: (theme: DesktopTheme) => ipcRenderer.invoke("theme:set", theme),
})
