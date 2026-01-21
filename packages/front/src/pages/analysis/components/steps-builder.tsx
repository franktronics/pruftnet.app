import { cn } from '@repo/utils'
import { Plus } from 'lucide-react'
import { type ComponentProps } from 'react'
import { DraggableStepCard, StepCard, StepCardLayout, type Step } from './steps-card'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DragOverlay } from '@dnd-kit/core'

type StepsBuilderProps = {
    steps: Array<Step>
    activeId: number | string | null
} & ComponentProps<'div'>
export const StepsBuilder = (props: StepsBuilderProps) => {
    const { className, steps, activeId, ...rest } = props

    return (
        <div className={cn('flex flex-col gap-0', className)} {...rest}>
            <SortableContext items={steps} strategy={verticalListSortingStrategy}>
                {steps.map((step, index) => {
                    const isLast = index === steps.length - 1
                    const selected = step.id === 2

                    return (
                        <StepCardLayout isLast={isLast} selected={selected} index={index}>
                            <DraggableStepCard
                                cardId={step.id}
                                displayDropArea={step.id === activeId}
                            >
                                <StepCard
                                    key={step.id}
                                    cardId={step.id}
                                    step={step}
                                    isLast={isLast}
                                    selected={selected}
                                />
                            </DraggableStepCard>
                        </StepCardLayout>
                    )
                })}
                <DragOverlay>
                    {activeId ? (
                        <StepCard
                            cardId={activeId}
                            selected={true}
                            step={steps.find((s) => s.id === activeId)!}
                        />
                    ) : null}
                </DragOverlay>
            </SortableContext>
            <div className="flex gap-4">
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
