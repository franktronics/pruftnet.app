import { z } from 'zod'
import { useMemo, type ComponentProps } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { cn, queryClient, useMutateFetcher } from '@repo/utils'
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@repo/ui/atoms'
import { Popup } from '@repo/ui/organisms'
import type { AnalysisSummary } from '@repo/core-node/types'
import { fetcher } from '../../../config/client-trpc'
import { useAppForm } from '@repo/ui/molecules'

export type AnalysisCardProps = {
    data: AnalysisSummary
    onSetSelected: (analysisId: number | null) => void
} & ComponentProps<typeof Card>

export const AnalysisCard = (props: AnalysisCardProps) => {
    const { data, className, onSetSelected, ...rest } = props
    const { id, title, description, updatedAt } = data

    const updateDateLabel = useMemo(() => {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(updatedAt))
    }, [updatedAt])

    const { mutateData: deleteAnalysis, isPending: deletingAnalysis } = useMutateFetcher({
        procedure: fetcher.analysis.delete,
        popupOnFetching: {
            fetching: 'Deleting analysis...',
            success: 'Analysis deleted successfully.',
        },
        popupOnError: true,
    })

    const { mutateData: editAnalysis, isPending: editingAnalysis } = useMutateFetcher({
        procedure: fetcher.analysis.store,
        popupOnFetching: {
            fetching: 'Editing analysis...',
            success: 'Analysis edited successfully.',
        },
        popupOnError: true,
    })

    const editForm = useAppForm({
        defaultValues: {
            title: title,
            description: description,
        },
        validators: {
            onSubmit: z.object({
                title: z.string().min(3, 'Title must be at least 3 characters long'),
                description: z.string().min(10, 'Description must be at least 10 characters long'),
            }),
        },
        onSubmit: async (values) => {
            await editAnalysis({
                analysisId: id,
                title: values.value.title,
                description: values.value.description,
            })
            await queryClient.invalidateQueries({ queryKey: ['analysis', { id }] })
            await queryClient.invalidateQueries({ queryKey: ['analysis_list'] })
        },
    })

    return (
        <Card
            className={cn(
                'group border-border/70 hover:border-primary/40 p-0',
                'w-full cursor-pointer rounded transition-colors',
                'data-[selected=true]:border-primary/40',
                className,
            )}
            {...rest}
        >
            <CardHeader className="flex justify-between gap-4 p-4">
                <div
                    onClick={(e) => {
                        e.stopPropagation()
                        onSetSelected(id)
                    }}
                    className="grow"
                >
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <p className="text-muted-foreground text-xs">
                        Last modified: {updateDateLabel}
                    </p>
                </div>
                <div
                    className={cn(
                        'flex flex-none flex-col gap-2',
                        'opacity-0 transition-colors group-hover:opacity-100',
                    )}
                >
                    <Popup
                        title={`Delete "${title}"`}
                        description="Confirm that you want to delete this analysis."
                        trigger={
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                aria-label="Delete analysis"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        }
                        onConfirm={async () => {
                            onSetSelected(null)
                            await deleteAnalysis({ analysisId: id })
                            await queryClient.invalidateQueries({ queryKey: ['analysis', { id }] })
                            await queryClient.invalidateQueries({ queryKey: ['analysis_list'] })
                            return true
                        }}
                        btnCloseText="Cancel"
                        btnSaveText="Delete"
                        btnSaveprops={{ variant: 'destructive', disabled: deletingAnalysis }}
                    >
                        <p className="text-sm">
                            Deleting this analysis is permanent and cannot be undone. Are you sure
                            you want to proceed?
                        </p>
                    </Popup>
                    <Popup
                        title={`Eddit "${title}"`}
                        description="Change the details of this analysis."
                        trigger={
                            <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                aria-label="Edit analysis"
                            >
                                <Pencil className="size-4" />
                            </Button>
                        }
                        onConfirm={async () => {
                            await editForm.handleSubmit()
                            return true
                        }}
                        btnCloseText="Cancel"
                        btnSaveText="Save"
                        btnSaveprops={{ disabled: editingAnalysis }}
                    >
                        <div>
                            <editForm.AppField
                                name="title"
                                children={(field) => (
                                    <field.FormInput
                                        label="Analysis Title"
                                        description="Enter a title for the new analysis."
                                        placeholder="My Network Analysis"
                                    />
                                )}
                            />
                            <editForm.AppField
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
            </CardHeader>
        </Card>
    )
}
