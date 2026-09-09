import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@repo/ui/atoms'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@repo/ui/molecules'

import { useTheme } from './theme-provider'
import type { Theme } from './theme'

const themeOptions: Array<{
    readonly label: string
    readonly value: Theme
    readonly icon: typeof Sun
}> = [
    { label: 'Light', value: 'light', icon: Sun },
    { label: 'Dark', value: 'dark', icon: Moon },
    { label: 'System', value: 'system', icon: Monitor },
]

export function ThemeToggle() {
    const { theme, setTheme } = useTheme()
    const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[2]
    const ActiveIcon = activeTheme.icon

    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger
                    render={
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon"
                                    aria-label={`Change theme (current: ${activeTheme.label})`}
                                >
                                    <ActiveIcon />
                                </Button>
                            }
                        />
                    }
                />
                <TooltipContent>Theme: {activeTheme.label}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-36">
                {themeOptions.map((option) => {
                    const Icon = option.icon

                    return (
                        <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
                            <Icon />
                            <span>{option.label}</span>
                            {theme === option.value && (
                                <span className="text-muted-foreground ml-auto">✓</span>
                            )}
                        </DropdownMenuItem>
                    )
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
