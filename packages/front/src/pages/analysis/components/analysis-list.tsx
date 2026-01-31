import { z } from 'zod'
import { cn, queryClient, useMutateFetcher } from '@repo/utils'
import type { ComponentProps } from 'react'
import { AnalysisCard } from './analysis-card'
import { fetcher } from '../../../config/client-trpc'
import { Popup } from '@repo/ui/organisms'
import { Button } from '@repo/ui/atoms'
import { Plus } from 'lucide-react'
import { useAppForm } from '@repo/ui/molecules'

export type AnalysisListProps = {} & ComponentProps<'div'>

export const AnalysisList = (props: AnalysisListProps) => {
    const { className, ...rest } = props

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
            return true
        },
    })

    return (
        <div className={cn('p-2', className)} {...rest}>
            <div className="mb-4">
                <h2 className="text-2xl font-bold">Network Analyses</h2>
                <p>Browse and manage your network analyses below.</p>
            </div>
            <div>
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
                        console.log('Delete analysis confirmed')
                        return true
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
            <AnalysisCard
                title="Network Analysis 1"
                description="This is a description of Network Analysis 1."
                creationDate={new Date('2024-01-01')}
            />
        </div>
    )
}
