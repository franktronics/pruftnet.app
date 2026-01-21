import { cn } from '@repo/utils'
import { Plus, ScanLine, ScanText, Settings, Zap } from 'lucide-react'
import type { ComponentProps } from 'react'
import { StepCard, type Step } from './steps-card'

type StepsBuilderProps = {} & ComponentProps<'div'>
export const StepsBuilder = (props: StepsBuilderProps) => {
    const { className, ...rest } = props
    const steps: Step[] = [
        {
            id: 1,
            name: 'Network Discovery',
            description: 'Scan the network to identify active devices and their IP addresses',
            icon: <ScanLine className="size-5" />,
        },
        {
            id: 2,
            name: 'Port Analysis',
            description: 'Analyze open ports and running services on discovered devices',
            icon: <ScanText className="size-5" />,
        },
        {
            id: 3,
            name: 'Configuration',
            description: 'Configure analysis parameters and set up monitoring rules ',
            icon: <Settings className="size-5" />,
        },
        {
            id: 4,
            name: 'Execute Analysis',
            description: 'Run the complete network analysis and generate reports',
            icon: <Zap className="size-5" />,
        },
    ]
    return (
        <div className={cn('flex flex-col gap-0', className)} {...rest}>
            {steps.map((step, index) => (
                <StepCard
                    key={step.id}
                    step={step}
                    isLast={index === steps.length - 1}
                    selected={step.id === 2}
                />
            ))}
            <div className="mt-10 flex gap-4">
                <div className="size-10 shrink-0"></div>
                <div
                    className={cn(
                        'w-full rounded-lg border-2 border-dashed p-6',
                        'bg-muted/30 border-muted-foreground/30',
                        'hover:bg-primary/10 hover:border-primary',
                        'transition-colors duration-200',
                        'flex flex-col items-center justify-center gap-3',
                    )}
                >
                    <Plus className="text-muted-foreground/60 size-8" />
                    <div className="text-center">
                        <p className="text-muted-foreground text-sm font-medium">
                            Drop a component here to add a new step
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
