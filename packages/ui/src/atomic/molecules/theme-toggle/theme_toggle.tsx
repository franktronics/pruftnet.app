import { Moon, Sun } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../atoms'
import { Button } from '../../atoms'
import { useTheme } from './theme_provider'
import { ComponentPropsWithoutRef } from 'react'

type ThemeToggleProps = {
    className?: string
} & ComponentPropsWithoutRef<typeof DropdownMenu>

function ThemeToggle(props: ThemeToggleProps) {
    const { className, ...rest } = props
    const { setTheme } = useTheme()

    return (
        <DropdownMenu {...rest}>
            <DropdownMenuTrigger className={className} asChild>
                <Button variant="outline" size="icon">
                    <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme('light')}>Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('dark')}>Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme('system')}>System</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export { ThemeToggle }
