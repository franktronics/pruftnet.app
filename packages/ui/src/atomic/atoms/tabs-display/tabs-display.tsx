import * as React from 'react'
import { cn } from '@repo/utils'

interface TabsDisplayContextType {
    activeTab: string
    setActiveTab: (value: string) => void
    defaultValue?: string
}

const TabsDisplayContext = React.createContext<TabsDisplayContextType | undefined>(undefined)

function TabsDisplay({
    className,
    defaultValue,
    value,
    onValueChange,
    children,
    ...props
}: {
    className?: string
    defaultValue?: string
    value?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onValueChange'>) {
    const [internalValue, setInternalValue] = React.useState(defaultValue || '')
    const isControlled = value !== undefined
    const activeTab = isControlled ? value : internalValue

    const setActiveTab = React.useCallback(
        (newValue: string) => {
            if (!isControlled) {
                setInternalValue(newValue)
            }
            onValueChange?.(newValue)
        },
        [isControlled, onValueChange],
    )

    return (
        <TabsDisplayContext.Provider value={{ activeTab, setActiveTab, defaultValue }}>
            <div data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props}>
                {children}
            </div>
        </TabsDisplayContext.Provider>
    )
}

function TabsDisplayList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-slot="tabs-list"
            className={cn(
                'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
                className,
            )}
            role="tablist"
            {...props}
        >
            {children}
        </div>
    )
}

function TabsDisplayTrigger({
    className,
    value,
    children,
    ...props
}: {
    value: string
    children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const context = React.useContext(TabsDisplayContext)
    if (!context) {
        throw new Error('TabsDisplayTrigger must be used within TabsDisplay')
    }

    const { activeTab, setActiveTab } = context
    const isActive = activeTab === value

    return (
        <button
            data-slot="tabs-trigger"
            className={cn(
                "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            role="tab"
            aria-selected={isActive}
            data-state={isActive ? 'active' : 'inactive'}
            onClick={() => setActiveTab(value)}
            {...props}
        >
            {children}
        </button>
    )
}

function TabsDisplayContent({
    className,
    value,
    children,
    ...props
}: {
    value: string
    children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
    const context = React.useContext(TabsDisplayContext)
    if (!context) {
        throw new Error('TabsDisplayContent must be used within TabsDisplay')
    }

    const { activeTab } = context
    const isActive = activeTab === value

    return (
        <div
            data-slot="tabs-content"
            className={cn('flex-1 outline-none', className)}
            style={
                !isActive
                    ? {
                          display: 'none',
                      }
                    : {}
            }
            role="tabpanel"
            data-state={isActive ? 'active' : 'inactive'}
            {...props}
        >
            {children}
        </div>
    )
}

export { TabsDisplay, TabsDisplayList, TabsDisplayTrigger, TabsDisplayContent }
