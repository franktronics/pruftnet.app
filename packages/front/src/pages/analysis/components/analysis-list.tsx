import { z } from 'zod'
import { cn, queryClient, useMutateFetcher } from '@repo/utils'
import type { ComponentProps } from 'react'
import { AnalysisCard } from './analysis-card'
import { fetcher } from '../../../config/client-trpc'
import { Popup } from '@repo/ui/organisms'
import { Button, InputGroup, InputGroupAddon, InputGroupInput } from '@repo/ui/atoms'
import { Plus, Search } from 'lucide-react'
import { useAppForm } from '@repo/ui/molecules'
import type { AnalysisSummary } from '@repo/core-node/types'

export type AnalysisListProps = {
    analysisList: AnalysisSummary[]
    selectedAnalysisId: number | null
    onSelectAnalysis: (analysisId: number | null) => void
} & ComponentProps<'div'>

export const AnalysisList = (props: AnalysisListProps) => {
    const { className, analysisList, onSelectAnalysis, selectedAnalysisId, ...rest } = props

    const { mutateData: createAnalysis, isPending: creatingAnalysis } = useMutateFetcher({
        procedure: fetcher.analysis.create,
        popupOnFetching: {
            fetching: 'Creating analysis...',
            success: 'Analysis created successfully.',
        },
        popupOnError: true,
    })

    const form = useAppForm({
        defaultValues: { title: '', description: '' },
        validators: {
            onSubmit: z.object({
                title: z.string().min(3, 'Title must be at least 3 characters long'),
                description: z.string().min(10, 'Description must be at least 10 characters long'),
            }),
        },
        onSubmit: async (values) => {
            await createAnalysis({
                title: values.value.title,
                description: values.value.description,
                data: {},
            })
            await queryClient.invalidateQueries({ queryKey: ['analysis_list'] })
            form.reset()
        },
    })

    return (
        <div className={cn('grid h-full grid-rows-[auto_auto_1fr] p-2', className)} {...rest}>
            <div>
                <h2 className="text-2xl font-bold">Network Analyses</h2>
                <p>Browse and manage your network analyses below.</p>
            </div>
            <div className="flex items-center justify-between gap-2 py-4">
                <InputGroup className="h-8">
                    <InputGroupInput placeholder="Search..." />
                    <InputGroupAddon>
                        <Search />
                    </InputGroupAddon>
                    <InputGroupAddon align="inline-end">0 result</InputGroupAddon>
                </InputGroup>
                <Popup
                    title="Create New Analysis"
                    description="Fill in the details to create a new network analysis."
                    trigger={
                        <Button type="button" aria-label="Create analysis">
                            <Plus />
                            Analysis
                        </Button>
                    }
                    onConfirm={async () => {
                        await form.handleSubmit()
                        return form.state.canSubmit
                    }}
                    btnCloseText="Cancel"
                    btnSaveText="Create"
                    btnSaveprops={{ disabled: creatingAnalysis }}
                >
                    <div>
                        <form.AppField
                            name="title"
                            children={(field) => (
                                <field.FormInput
                                    label="Analysis Title"
                                    description="Enter a title for the new analysis."
                                    placeholder="My Network Analysis"
                                />
                            )}
                        />
                        <form.AppField
                            name="description"
                            children={(field) => (
                                <field.FormTextarea
                                    label="Analysis Description"
                                    description="Enter a description for the new analysis."
                                    placeholder="This analysis focuses on..."
                                />
                            )}
                        />
                    </div>
                </Popup>
            </div>
            <div className="scrollbar-thin overflow-auto">
                <article className="flex flex-col gap-3">
                    {analysisList.length === 0 ? (
                        <p className="text-muted-foreground">
                            No analyses found. Create one to get started!
                        </p>
                    ) : null}
                    {analysisList.map((analysis) => (
                        <AnalysisCard
                            key={analysis.id}
                            data={analysis}
                            data-selected={analysis.id === selectedAnalysisId}
                            onSetSelected={onSelectAnalysis}
                        />
                    ))}
                </article>
            </div>
        </div>
    )
}
