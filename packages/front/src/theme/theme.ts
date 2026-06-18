export type Theme = "dark" | "light" | "system"

export const themes = ["light", "dark", "system"] as const satisfies readonly Theme[]

export function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system"
}
