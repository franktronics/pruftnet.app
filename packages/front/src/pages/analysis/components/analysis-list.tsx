import { cn } from '@repo/utils'
import type { ComponentProps } from 'react'
import { AnalysisCard } from './analysis-card'

export type AnalysisListProps = {} & ComponentProps<'div'>

export const AnalysisList = (props: AnalysisListProps) => {
    const { className, ...rest } = props
    return (
        <div className={cn('p-2', className)} {...rest}>
            <div className="mb-4">
                <h2 className="text-2xl font-bold">Network Analyses</h2>
                <p>Browse and manage your network analyses below.</p>
            </div>
            <AnalysisCard
                title="Network Analysis 1"
                description="This is a description of Network Analysis 1."
                creationDate={new Date('2024-01-01')}
            />
        </div>
    )
}
