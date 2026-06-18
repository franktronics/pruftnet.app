import { contextBridge, ipcRenderer } from "electron"

type DesktopTheme = "dark" | "light" | "system"

contextBridge.exposeInMainWorld("pruftnet", {
  setTheme: (theme: DesktopTheme) => ipcRenderer.invoke("theme:set", theme),
})
