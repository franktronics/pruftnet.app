import { useSortable } from '@dnd-kit/sortable'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
    Button,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    InputGroupText,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@repo/ui/atoms'
import { cn } from '@repo/utils'
import { GripVertical, Info } from 'lucide-react'
import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'

export type Step = {
    id: number
    name: string
    description: string
    icon: ReactNode
}

export type StepCardProps = {
    step: Step
    selected?: boolean
    dragHandleProps?: ComponentProps<'button'>
} & Omit<ComponentProps<'article'>, 'children'>

export const StepCard = (props: StepCardProps) => {
    const { step, className, selected = false, dragHandleProps, ...rest } = props

    return (
        <article
            className={cn(
                'w-full hover:cursor-pointer',
                'grid grid-cols-[1fr_auto] grid-rows-[auto_auto]',
                'rounded-lg border p-4 transition-all duration-300',
                { 'bg-card border-primary shadow-primary/10 shadow-md': selected },
                {
                    'bg-muted/50 border-border hover:bg-muted/90 hover:border-muted-foreground/30':
                        !selected,
                },
            )}
            {...rest}
        >
            <div className="col-start-1 flex items-center gap-3">
                <div
                    className={cn(
                        'flex size-9 items-center justify-center rounded-md transition-colors duration-300',
                        selected ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground',
                    )}
                >
                    {step.icon}
                </div>
                <h3
                    className={cn(
                        'text-sm leading-none transition-colors duration-300',
                        selected ? 'text-primary font-semibold' : 'text-foreground',
                    )}
                >
                    {step.name}
                </h3>
            </div>
            <p className="text-muted-foreground col-start-1 pt-3 text-sm">{step.description}</p>
            <button
                type="button"
                className={cn(
                    'col-start-2 row-span-2 row-start-1 h-full self-center',
                    'cursor-grab active:cursor-grabbing',
                )}
                {...dragHandleProps}
            >
                <GripVertical className="text-muted-foreground size-5" />
            </button>
        </article>
    )
}

type DraggableStepCardProps = {
    cardId: number | string
    isLast?: boolean
    activeId: number | string | null
    children: ReactElement<StepCardProps>
} & Omit<ComponentProps<'div'>, 'children'>
export const DraggableStepCard = (props: DraggableStepCardProps) => {
    const { cardId, isLast = true, className, activeId, children, ...rest } = props
    const { attributes, listeners, setNodeRef, transform, transition, setActivatorNodeRef } =
        useSortable({ id: cardId })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    }

    const handleProps = {
        ...listeners,
        ...attributes,
        ref: setActivatorNodeRef,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'relative w-full',
                { 'mb-25': !isLast },
                { 'opacity-40': activeId === cardId },
                className,
            )}
            {...rest}
        >
            {cloneElement(children, { dragHandleProps: handleProps })}
        </div>
    )
}

type LibraryStepCardProps = {
    step: Step
    templateId: string
    activeId: number | string | null
} & Omit<ComponentProps<'div'>, 'children'>
export const LibraryStepCard = (props: LibraryStepCardProps) => {
    const { step, templateId, activeId, className, ...rest } = props
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `library-${templateId}`,
        data: {
            source: 'library',
            templateId,
            step,
        },
    })

    const style = {
        transform: CSS.Translate.toString(transform),
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'w-full',
                { 'opacity-70': isDragging },
                { 'opacity-40': activeId === `library-${templateId}` },
                className,
            )}
            {...attributes}
            {...listeners}
            {...rest}
        >
            <StepCard step={step} />
        </div>
    )
}

type StepCardLayoutProps = {
    isLast?: boolean
    selected?: boolean
    index: number
} & ComponentProps<'div'>
export const StepCardLayout = (props: StepCardLayoutProps) => {
    const { children, className, isLast = true, selected = false, index, ...rest } = props

    return (
        <div
            className={cn(
                'relative',
                'flex gap-4 focus-visible:outline-none',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
                className,
            )}
            {...rest}
        >
            <aside className="flex flex-col items-center">
                <div
                    className={cn(
                        'rounded-full border-2 transition-all duration-300',
                        'flex size-10 shrink-0 items-center justify-center',
                        selected
                            ? 'bg-primary text-primary-foreground border-primary ring-primary/20 ring-4'
                            : 'bg-muted text-foreground border-border',
                    )}
                >
                    <span className="text-sm font-medium">{index}</span>
                </div>
                {!isLast ? (
                    <div
                        className={cn(
                            'mt-1 h-full min-h-8 w-0.5 rounded-full transition-colors duration-300',
                            selected ? 'bg-primary' : 'bg-border',
                        )}
                    />
                ) : null}
            </aside>

            {children}

            {!isLast ? (
                <div className={cn('absolute max-w-40', 'top-[calc(100%-2rem)] -translate-y-full')}>
                    <StepDelay value={0} onChange={console.log} />
                </div>
            ) : null}
        </div>
    )
}

type StepDelayProps = {
    value: number
    onChange: (value: number) => void
} & Omit<ComponentProps<'div'>, 'children' | 'onChange'>
const StepDelay = (props: StepDelayProps) => {
    const { value, onChange, className, ...rest } = props

    return (
        <div className={cn('group flex items-center gap-2', className)} {...rest}>
            <div className="bg-card rounded-lg p-1">
                <InputGroup>
                    <InputGroupInput
                        value={value}
                        placeholder="0.00"
                        type="number"
                        onChange={(e) => onChange(parseInt(e.target.value, 10))}
                    />
                    <InputGroupAddon align="inline-end">
                        <InputGroupText>ms</InputGroupText>
                    </InputGroupAddon>
                </InputGroup>
            </div>
            <Popover>
                <PopoverTrigger
                    className={cn('opacity-0', 'group-hover:opacity-100 group-focus:opacity-100')}
                    asChild
                >
                    <Button variant="secondary" size="icon">
                        <Info />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="flex flex-col gap-1 rounded-xl text-sm">
                    <p className="font-medium">Delay between steps in milliseconds.</p>
                    <p>
                        This setting allows you to specify a delay between the execution of each
                        step in the process. Adjusting this value can help manage resource usage and
                        timing of operations.
                    </p>
                </PopoverContent>
            </Popover>
        </div>
    )
}
