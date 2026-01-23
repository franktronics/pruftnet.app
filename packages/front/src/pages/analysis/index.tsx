import {
    TabsDisplay,
    TabsDisplayList,
    TabsDisplayTrigger,
    TabsDisplayContent,
} from '@repo/ui/atoms'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@repo/ui/atoms'
import { StepsBuilder } from './components/steps-builder'
import { StepsComponents } from './components/steps-components'
import { StepsProperty } from './components/steps-property'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
    DragOverlay,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { Step } from './components/steps-card'
import { StepCard } from './components/steps-card'
import { cn } from '@repo/utils'

function Analysis() {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )
    const [activeId, setActiveId] = useState<number | string | null>(null)
    const [buildedSteps, setBuildedSteps] = useState<Step[]>([])
    const [activeDragData, setActiveDragData] = useState<any>(null)

    const activeStep = activeDragData?.step || buildedSteps.find((s) => s.id === activeId)
    const isFromLibrary = typeof activeId === 'string' && activeId.startsWith('library-')

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event

        if (!over) {
            setActiveId(null)
            return
        }

        const isFromLibrary = active.data.current?.source === 'library'
        const isToDropzone = over.id === 'builder-dropzone'

        if (isFromLibrary && isToDropzone) {
            const templateStep = active.data.current?.step
            if (templateStep) {
                const newStep = {
                    ...templateStep,
                    id: Date.now() + Math.random(),
                }
                setBuildedSteps((prev) => [...prev, newStep])
            }
        } else if (!isFromLibrary && active.id !== over.id) {
            setBuildedSteps((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id)
                const newIndex = items.findIndex((item) => item.id === over.id)

                return arrayMove(items, oldIndex, newIndex)
            })
        }
        setActiveId(null)
        setActiveDragData(null)
    }
    function handleDragStart(event: DragStartEvent) {
        const { active } = event
        setActiveId(active.id)
        setActiveDragData(active.data.current)
    }

    return (
        <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={20} minSize={15} className="p-4">
                <div>OK</div>
            </ResizablePanel>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                onDragStart={handleDragStart}
            >
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40} minSize={30}>
                    <StepsBuilder steps={buildedSteps} activeId={activeId} />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40} minSize={30} className="p-4">
                    <TabsDisplay defaultValue="comp">
                        <TabsDisplayList className="ml-auto">
                            <TabsDisplayTrigger value="prop">Property</TabsDisplayTrigger>
                            <TabsDisplayTrigger value="comp">Steps Components</TabsDisplayTrigger>
                        </TabsDisplayList>
                        <TabsDisplayContent value="prop">
                            <StepsProperty />
                        </TabsDisplayContent>
                        <TabsDisplayContent value="comp">
                            <StepsComponents activeId={activeId} />
                        </TabsDisplayContent>
                    </TabsDisplay>
                </ResizablePanel>
                <DragOverlay dropAnimation={null}>
                    {activeId && activeStep ? (
                        <div
                            className={cn(
                                'shadow-2xl',
                                'ring-primary/50 rounded-lg ring-2 ring-offset-2',
                            )}
                            style={{ zIndex: 9999 }}
                        >
                            <StepCard selected={false} step={activeStep} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </ResizablePanelGroup>
    )
}

export default Analysis
