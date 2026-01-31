import { useMemo, type ComponentProps } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@repo/utils'
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@repo/ui/atoms'
import { Popup } from '@repo/ui/organisms'

export type AnalysisCardProps = {
    title: string
    description: string
    creationDate: Date
} & ComponentProps<typeof Card>

export const AnalysisCard = (props: AnalysisCardProps) => {
    const { title, description, creationDate, className, ...rest } = props

    const creationDateLabel = useMemo(() => {
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(creationDate)
    }, [creationDate])

    return (
        <Card
            className={cn(
                'group border-border/70 hover:border-primary/40 hover:bg-muted/40',
                'w-full cursor-pointer rounded transition-colors',
                className,
            )}
            {...rest}
        >
            <CardHeader className="space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-base">{title}</CardTitle>
                        <CardDescription>{description}</CardDescription>
                    </div>
                    <Popup
                        title={`Delete "${title}"`}
                        description="Confirm that you want to delete this analysis."
                        trigger={
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                aria-label="Delete analysis"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        }
                        onConfirm={async () => {
                            console.log('Delete analysis confirmed')
                            return true
                        }}
                        btnCloseText="Cancel"
                        btnSaveText="Delete"
                    >
                        <p className="text-sm">
                            Deleting this analysis is permanent and cannot be undone. Are you sure
                            you want to proceed?
                        </p>
                    </Popup>
                </div>
                <p className="text-muted-foreground text-xs">Last modified: {creationDateLabel}</p>
            </CardHeader>
        </Card>
    )
}
