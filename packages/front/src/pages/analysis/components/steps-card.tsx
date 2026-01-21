import { cn } from '@repo/utils'
import type { ComponentProps, ReactNode } from 'react'

export type Step = {
    id: number
    name: string
    description: string
    icon: ReactNode
}

export type StepCardProps = {
    step: Step
    isLast: boolean
    selected?: boolean
} & Omit<ComponentProps<'div'>, 'children'>

export const StepCard = (props: StepCardProps) => {
    const { step, isLast, selected = false, className, ...rest } = props

    return (
        <div
            className={cn(
                'hover:cursor-pointer',
                'flex gap-4 rounded-lg text-left focus-visible:outline-none',
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
                    <span className="text-sm font-medium">{step.id}</span>
                </div>
                {!isLast ? (
                    <div
                        className={cn(
                            'h-full min-h-8 w-0.5 rounded-full transition-colors duration-300',
                            selected ? 'bg-primary' : 'bg-border',
                        )}
                    />
                ) : null}
            </aside>

            <article
                className={cn(
                    'mb-4 flex flex-1 flex-col gap-3 rounded-lg border p-4 transition-all duration-300',
                    selected
                        ? 'bg-card border-primary shadow-primary/10 shadow-md'
                        : 'bg-muted/50 border-border hover:bg-muted/80 hover:border-muted-foreground/20',
                )}
            >
                <div className="flex items-center gap-3">
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
                <p className="text-muted-foreground text-sm">{step.description}</p>
            </article>
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
        <div className={cn('flex items-center gap-2', className)} {...rest}>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={cn(
                    'border-border bg-background h-7 w-16 rounded-md border px-2 text-center text-xs',
                    'focus:border-primary focus:ring-primary focus:ring-1 focus:outline-none',
                    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                )}
            />
            <span className="text-muted-foreground text-xs">ms</span>
        </div>
    )
}
