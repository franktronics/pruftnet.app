import { cn } from '@repo/utils'
import { Plus } from 'lucide-react'
import { type ComponentProps } from 'react'
import { DraggableStepCard, StepCard, StepCardLayout, type Step } from './steps-card'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DragOverlay, useDroppable } from '@dnd-kit/core'

type StepsBuilderProps = {
    steps: Array<Step>
    activeId: number | string | null
} & ComponentProps<'div'>
export const StepsBuilder = (props: StepsBuilderProps) => {
    const { className, steps, activeId, ...rest } = props
    const { setNodeRef, isOver } = useDroppable({
        id: 'builder-dropzone',
        data: {
            accepts: ['library', 'builder'],
        },
    })

    const activeStep = steps.find((s) => s.id === activeId)
    const isFromLibrary = typeof activeId === 'string' && activeId.startsWith('library-')

    return (
        <div className={cn('flex h-full flex-col', className)} {...rest}>
            <div className="mb-4 flex-none p-4">
                <h3 className="text-lg font-semibold">Analysis Workflow Steps</h3>
                <p className="text-muted-foreground text-sm">
                    Drag and drop to reorder steps or add new ones from the component library
                </p>
            </div>

            <div className="scrollbar-thin overflow-auto px-4">
                <SortableContext items={steps} strategy={verticalListSortingStrategy}>
                    {steps.map((step, index) => {
                        const isLast = index === steps.length - 1
                        const selected = step.id === 2

                        return (
                            <StepCardLayout
                                key={step.id}
                                isLast={isLast}
                                selected={selected}
                                index={index}
                            >
                                <DraggableStepCard
                                    cardId={step.id}
                                    activeId={activeId}
                                    isLast={isLast}
                                >
                                    <StepCard step={step} selected={selected} />
                                </DraggableStepCard>
                            </StepCardLayout>
                        )
                    })}
                    <DragOverlay>
                        {activeId && activeStep ? (
                            <div
                                className={cn(
                                    'shadow-lg',
                                    isFromLibrary
                                        ? 'ring-primary/50 ring-2 ring-offset-2'
                                        : 'opacity-90',
                                )}
                            >
                                <StepCard selected={!isFromLibrary} step={activeStep} />
                            </div>
                        ) : null}
                    </DragOverlay>
                </SortableContext>
            </div>

            <div ref={setNodeRef} className="mt-8 flex flex-none gap-4 p-4 pt-0">
                <div
                    className={cn(
                        'w-full rounded-lg border-2 border-dashed p-6',
                        'bg-muted/30 border-muted-foreground/30',
                        'transition-colors duration-200',
                        'flex flex-col items-center justify-center gap-3',
                        isOver
                            ? 'bg-primary/20 border-primary ring-primary/20 ring-4'
                            : 'hover:bg-primary/10 hover:border-primary',
                    )}
                >
                    <Plus
                        className={cn(
                            'size-8 transition-colors',
                            isOver ? 'text-primary' : 'text-muted-foreground/60',
                        )}
                    />
                    <div className="text-center">
                        <p
                            className={cn(
                                'text-sm font-medium transition-colors',
                                isOver ? 'text-primary' : 'text-muted-foreground',
                            )}
                        >
                            Drop a component here to add a new step
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
