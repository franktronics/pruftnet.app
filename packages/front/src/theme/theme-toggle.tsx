import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react"

import { Button } from "@repo/ui/atoms"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/molecules"

import { useTheme } from "./theme-provider"
import type { Theme } from "./theme"

const themeOptions: Array<{
  readonly label: string
  readonly value: Theme
  readonly icon: typeof SunIcon
}> = [
  { label: "Light", value: "light", icon: SunIcon },
  { label: "Dark", value: "dark", icon: MoonIcon },
  { label: "System", value: "system", icon: DesktopIcon },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[2]
  const ActiveIcon = activeTheme.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Change theme">
            <ActiveIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-36">
        {themeOptions.map((option) => {
          const Icon = option.icon

          return (
            <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
              <Icon />
              <span>{option.label}</span>
              {theme === option.value && <span className="ml-auto text-muted-foreground">✓</span>}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
