import { Search } from 'lucide-react'
import { Input } from '../../atoms'
import { cn } from '@repo/utils'
import { ChangeEvent, ComponentPropsWithoutRef } from 'react'

export type SearchInputProps = {
    className?: string
    onChange?: (value: string) => void
} & ComponentPropsWithoutRef<typeof Input>

export function SearchInput(props: SearchInputProps) {
    const { className, onChange, ...rest } = props

    return (
        <div className="relative">
            <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
                type="search"
                className={cn(className, '!pl-9 !pr-4')}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value)}
                placeholder="Search..."
                {...rest}
            />
        </div>
    )
}
