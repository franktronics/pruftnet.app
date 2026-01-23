import { cn } from '@repo/utils'
import type { ComponentProps } from 'react'

export type AnalysisListProps = {} & ComponentProps<'div'>

export const AnalysisList = (props: AnalysisListProps) => {
    const { className, ...rest } = props
    return (
        <div className={cn('', className)} {...rest}>
            Analysis List
        </div>
    )
}
