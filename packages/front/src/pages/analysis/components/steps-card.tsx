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
            {/* Indicator Column */}
            <div className="flex flex-col items-center">
                {/* Step Indicator */}
                <div
                    className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
                        selected
                            ? 'bg-primary text-primary-foreground border-primary ring-primary/20 ring-4'
                            : 'bg-muted text-foreground border-border',
                    )}
                >
                    <span className="text-sm font-medium">{step.id}</span>
                </div>
                {/* Connector Line */}
                {!isLast && (
                    <div
                        className={cn(
                            'mt-2 h-full min-h-8 w-0.5 rounded-full transition-colors duration-300',
                            selected ? 'bg-primary' : 'bg-border',
                        )}
                    />
                )}
            </div>

            {/* Card Content */}
            <div
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
            </div>
        </div>
    )
}
