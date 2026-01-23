import type { ComponentProps } from 'react'
import { StepCard } from './steps-card'
import { Zap } from 'lucide-react'

type StepsComponentsProps = {} & ComponentProps<'div'>
export const StepsComponents = (props: StepsComponentsProps) => {
    const { ...rest } = props

    const step = {
        id: 4,
        name: 'Execute Analysis',
        description: 'Run the complete network analysis and generate reports',
        icon: <Zap className="size-5" />,
    }

    return (
        <div {...rest}>
            <StepCard step={step} />
        </div>
    )
}
