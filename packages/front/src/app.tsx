import { RouterProvider } from "@tanstack/react-router"

import { ThemeProvider } from "./theme/theme-provider"
import { router } from "./pages/router"
import "./styles/main.css"

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
