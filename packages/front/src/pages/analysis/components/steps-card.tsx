import {
    Card,
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
    InputGroupText,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@repo/ui/atoms'
import { cn } from '@repo/utils'
import { Info } from 'lucide-react'
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
                'relative hover:cursor-pointer',
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
                    <span className="text-sm font-medium">{step.id}</span>
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

            <article
                className={cn(
                    'mb-25 flex flex-1 flex-col gap-3 rounded-lg border p-4 transition-all duration-300',
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

            {!isLast ? (
                <Card
                    className={cn(
                        'absolute max-w-40 p-2',
                        'top-[calc(100%-1.5rem)] -translate-y-full',
                    )}
                >
                    <StepDelay value={0} onChange={console.log} />
                </Card>
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
        <InputGroup className={cn('', className)} {...rest}>
            <Popover>
                <PopoverTrigger asChild>
                    <InputGroupAddon>
                        <InputGroupButton variant="secondary" size="icon-xs">
                            <Info />
                        </InputGroupButton>
                    </InputGroupAddon>
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
    )
}
