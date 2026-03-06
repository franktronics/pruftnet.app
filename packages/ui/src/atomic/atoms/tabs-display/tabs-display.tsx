import * as React from 'react'
import { Activity } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@repo/utils'
import { tabsListVariants } from '../tabs/tabs'

type TabsDisplayVariant = VariantProps<typeof tabsListVariants>['variant']

type TabsDisplayContextValue = {
    activeValue: string | null
    orientation: 'horizontal' | 'vertical'
    setActiveValue: (value: string) => void
    registerValue: (value: string) => () => void
    registerTriggerNode: (value: string, node: HTMLButtonElement | null) => void
    moveFocus: (currentValue: string, direction: 1 | -1) => void
    focusEdge: (edge: 'first' | 'last') => void
    getTriggerId: (value: string) => string
    getContentId: (value: string) => string
    isFirstValue: (value: string) => boolean
}

const TabsDisplayContext = React.createContext<TabsDisplayContextValue | null>(null)

const triggerClassName =
    "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring text-foreground/60 hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

type TabsDisplayProps = {
    defaultValue?: string
    value?: string
    onValueChange?: (value: string) => void
    orientation?: 'horizontal' | 'vertical'
} & React.HTMLAttributes<HTMLDivElement>

const TabsDisplay = React.forwardRef<HTMLDivElement, TabsDisplayProps>((props, ref) => {
    const {
        className,
        defaultValue,
        value,
        onValueChange,
        orientation = 'horizontal',
        children,
        ...rest
    } = props

    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = React.useState<string | null>(defaultValue ?? null)
    const activeValue = (isControlled ? value : internalValue) ?? null

    const initialValueSetRef = React.useRef(Boolean(defaultValue !== undefined || isControlled))
    const valueOrderRef = React.useRef<string[]>([])
    const triggerRefs = React.useRef(new Map<string, HTMLButtonElement | null>())
    const baseId = React.useId()

    React.useEffect(() => {
        if (!isControlled && defaultValue !== undefined) {
            setInternalValue(defaultValue)
            initialValueSetRef.current = true
        }
    }, [defaultValue, isControlled])

    const setActiveValue = React.useCallback(
        (nextValue: string) => {
            if (!isControlled) {
                setInternalValue(nextValue)
            }
            onValueChange?.(nextValue)
        },
        [isControlled, onValueChange],
    )

    const registerValue = React.useCallback(
        (tabValue: string) => {
            if (!valueOrderRef.current.includes(tabValue)) {
                valueOrderRef.current.push(tabValue)
            }

            if (!initialValueSetRef.current && !isControlled) {
                initialValueSetRef.current = true
                setInternalValue((current) => current ?? tabValue)
            }

            return () => {
                valueOrderRef.current = valueOrderRef.current.filter((entry) => entry !== tabValue)
                triggerRefs.current.delete(tabValue)
            }
        },
        [isControlled],
    )

    const registerTriggerNode = React.useCallback(
        (tabValue: string, node: HTMLButtonElement | null) => {
            if (node) {
                triggerRefs.current.set(tabValue, node)
            } else {
                triggerRefs.current.delete(tabValue)
            }
        },
        [],
    )

    const focusValue = React.useCallback(
        (tabValue: string) => {
            setActiveValue(tabValue)
            triggerRefs.current.get(tabValue)?.focus()
        },
        [setActiveValue],
    )

    const moveFocus = React.useCallback(
        (currentValue: string, direction: 1 | -1) => {
            const values = valueOrderRef.current
            if (values.length === 0) {
                return
            }
            const currentIndex = values.indexOf(currentValue)
            const nextIndex =
                currentIndex === -1 ? 0 : (currentIndex + direction + values.length) % values.length
            const nextValue = values[nextIndex]
            if (nextValue === undefined) {
                return
            }
            focusValue(nextValue)
        },
        [focusValue],
    )

    const focusEdge = React.useCallback(
        (edge: 'first' | 'last') => {
            const values = valueOrderRef.current
            if (!values.length) {
                return
            }
            const target = edge === 'first' ? values[0] : values[values.length - 1]
            if (target === undefined) {
                return
            }
            focusValue(target)
        },
        [focusValue],
    )

    const getTriggerId = React.useCallback(
        (tabValue: string) => `${baseId}-${tabValue}-trigger`,
        [baseId],
    )
    const getContentId = React.useCallback(
        (tabValue: string) => `${baseId}-${tabValue}-content`,
        [baseId],
    )

    const isFirstValue = React.useCallback(
        (tabValue: string) => valueOrderRef.current[0] === tabValue,
        [],
    )

    const contextValue = React.useMemo<TabsDisplayContextValue>(
        () => ({
            activeValue,
            orientation,
            setActiveValue,
            registerValue,
            registerTriggerNode,
            moveFocus,
            focusEdge,
            getTriggerId,
            getContentId,
            isFirstValue,
        }),
        [
            activeValue,
            orientation,
            setActiveValue,
            registerValue,
            registerTriggerNode,
            moveFocus,
            focusEdge,
            getTriggerId,
            getContentId,
            isFirstValue,
        ],
    )

    return (
        <TabsDisplayContext.Provider value={contextValue}>
            <div
                ref={ref}
                data-slot="tabs"
                data-orientation={orientation}
                data-horizontal={orientation === 'horizontal' ? '' : undefined}
                data-vertical={orientation === 'vertical' ? '' : undefined}
                className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
                {...rest}
            >
                {children}
            </div>
        </TabsDisplayContext.Provider>
    )
})
TabsDisplay.displayName = 'TabsDisplay'

const useTabsDisplayContext = () => {
    const context = React.useContext(TabsDisplayContext)
    if (!context) {
        throw new Error('TabsDisplay components must be used within TabsDisplay')
    }
    return context
}

type TabsDisplayListProps = {
    variant?: TabsDisplayVariant
} & React.HTMLAttributes<HTMLDivElement>

const TabsDisplayList = React.forwardRef<HTMLDivElement, TabsDisplayListProps>((props, ref) => {
    const { className, variant = 'default', children, ...rest } = props
    const { orientation } = useTabsDisplayContext()

    return (
        <div
            ref={ref}
            role="tablist"
            data-slot="tabs-list"
            data-variant={variant}
            aria-orientation={orientation}
            className={cn(tabsListVariants({ variant }), className)}
            {...rest}
        >
            {children}
        </div>
    )
})
TabsDisplayList.displayName = 'TabsDisplayList'

type TabsDisplayTriggerProps = {
    value: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'>

const TabsDisplayTrigger = React.forwardRef<HTMLButtonElement, TabsDisplayTriggerProps>(
    (props, ref) => {
        const {
            value,
            className,
            children,
            onClick,
            onKeyDown,
            type = 'button',
            disabled,
            ...rest
        } = props
        const {
            activeValue,
            setActiveValue,
            registerValue,
            registerTriggerNode,
            moveFocus,
            focusEdge,
            getTriggerId,
            getContentId,
            orientation,
            isFirstValue,
        } = useTabsDisplayContext()

        React.useEffect(() => {
            const unregister = registerValue(value)
            return unregister
        }, [value, registerValue])

        const assignRef = React.useCallback(
            (node: HTMLButtonElement | null) => {
                registerTriggerNode(value, node)
                if (typeof ref === 'function') {
                    ref(node)
                } else if (ref) {
                    // eslint-disable-next-line no-param-reassign
                    ;(ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
                }
            },
            [ref, registerTriggerNode, value],
        )

        const isActive = activeValue === value
        const triggerId = getTriggerId(value)
        const contentId = getContentId(value)
        const hasSelection = activeValue !== null
        const tabIndex = isActive || (!hasSelection && isFirstValue(value)) ? 0 : -1

        const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
            onClick?.(event)
            if (event.defaultPrevented || disabled) {
                return
            }
            setActiveValue(value)
        }

        const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
            onKeyDown?.(event)
            if (event.defaultPrevented || disabled) {
                return
            }

            const moveNext = () => moveFocus(value, 1)
            const movePrev = () => moveFocus(value, -1)

            if (event.key === 'Home') {
                event.preventDefault()
                focusEdge('first')
                return
            }

            if (event.key === 'End') {
                event.preventDefault()
                focusEdge('last')
                return
            }

            const isHorizontal = orientation === 'horizontal'

            if (isHorizontal && event.key === 'ArrowRight') {
                event.preventDefault()
                moveNext()
                return
            }
            if (isHorizontal && event.key === 'ArrowLeft') {
                event.preventDefault()
                movePrev()
                return
            }
            if (!isHorizontal && event.key === 'ArrowDown') {
                event.preventDefault()
                moveNext()
                return
            }
            if (!isHorizontal && event.key === 'ArrowUp') {
                event.preventDefault()
                movePrev()
            }
        }

        return (
            <button
                ref={assignRef}
                type={type}
                role="tab"
                data-slot="tabs-trigger"
                id={triggerId}
                aria-controls={contentId}
                aria-selected={isActive}
                data-state={isActive ? 'active' : 'inactive'}
                tabIndex={tabIndex}
                disabled={disabled}
                className={cn(
                    triggerClassName,
                    'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
                    'data-[state=active]:bg-background dark:data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 data-[state=active]:text-foreground',
                    'after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
                    className,
                )}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                {...rest}
            >
                {children}
            </button>
        )
    },
)
TabsDisplayTrigger.displayName = 'TabsDisplayTrigger'

type TabsDisplayContentProps = {
    value: string
} & React.HTMLAttributes<HTMLDivElement>

const TabsDisplayContent = React.forwardRef<HTMLDivElement, TabsDisplayContentProps>(
    (props, ref) => {
        const { value, className, children, ...rest } = props
        const { activeValue, getTriggerId, getContentId } = useTabsDisplayContext()

        const isActive = activeValue === value
        const triggerId = getTriggerId(value)
        const contentId = getContentId(value)

        return (
            <Activity mode={isActive ? 'visible' : 'hidden'}>
                <div
                    ref={ref}
                    role="tabpanel"
                    id={contentId}
                    aria-labelledby={triggerId}
                    aria-hidden={!isActive}
                    tabIndex={isActive ? 0 : -1}
                    data-slot="tabs-content"
                    data-state={isActive ? 'active' : 'inactive'}
                    className={cn('flex-1 text-sm outline-none', className)}
                    {...rest}
                >
                    {children}
                </div>
            </Activity>
        )
    },
)
TabsDisplayContent.displayName = 'TabsDisplayContent'

export { TabsDisplay, TabsDisplayList, TabsDisplayTrigger, TabsDisplayContent }
