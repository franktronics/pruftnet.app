import { AnalysisGraph } from '@repo/ui/organisms'
import { cn } from '@repo/utils'
import type { ComponentProps } from 'react'

export type AnalysisMapProps = {} & ComponentProps<'div'>

export const AnalysisMap = (props: AnalysisMapProps) => {
    const { className, ...rest } = props
    return (
        <section className={cn('h-full w-full', className)} {...rest}>
            <AnalysisGraph className="h-full w-full" />
        </section>
    )
}
