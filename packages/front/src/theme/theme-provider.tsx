import { createContext, use, useEffect, useState, type ReactNode } from "react"

import { isTheme, type Theme } from "./theme"

declare global {
  interface Window {
    readonly pruftnet?: {
      readonly platform: string
      readonly setTheme: (theme: Theme) => Promise<"dark" | "light">
    }
  }
}

type ThemeProviderValue = {
  readonly theme: Theme
  readonly setTheme: (theme: Theme) => void
}

const storageKey = "pruftnet-theme"
const ThemeContext = createContext<ThemeProviderValue | undefined>(undefined)

function getInitialTheme(): Theme {
  if (typeof window === "undefined") {
    return "system"
  }

  const storedTheme = window.localStorage.getItem(storageKey)
  return isTheme(storedTheme) ? storedTheme : "system"
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement
  root.classList.remove("light", "dark")

  if (theme === "system") {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    root.classList.add(systemTheme)
  } else {
    root.classList.add(theme)
  }
}

async function syncElectronTheme(theme: Theme) {
  await window.pruftnet?.setTheme(theme)
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(storageKey, theme)
    void syncElectronTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== "system") {
      return
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = () => applyTheme("system")

    mediaQuery.addEventListener("change", listener)
    return () => mediaQuery.removeEventListener("change", listener)
  }, [theme])

  return (
    <ThemeContext value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext>
  )
}

export function useTheme() {
  const context = use(ThemeContext)

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }

  return context
}
