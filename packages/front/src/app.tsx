import { RouterProvider } from "@tanstack/react-router"
import { useEffect } from "react"

import { syncDocumentWindowControlsOverlayClass } from "./desktop/window-controls-overlay"
import { ThemeProvider } from "./theme/theme-provider"
import { router } from "./pages/router"
import "./styles/main.css"

export function App() {
  useEffect(() => {
    if (!window.pruftnet) {
      return
    }

    document.documentElement.dataset.desktopPlatform = window.pruftnet.platform
    return syncDocumentWindowControlsOverlayClass()
  }, [])

  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
