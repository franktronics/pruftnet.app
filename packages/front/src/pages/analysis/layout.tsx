import { cn } from '@repo/utils'
import { Outlet } from '@tanstack/react-router'
import { AnalysisProvider } from './context/analysis-context'
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export const Layout = () => {
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    )

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter}>
            <AnalysisProvider>
                <div className={cn('h-full')}>
                    <Outlet />
                </div>
            </AnalysisProvider>
        </DndContext>
    )
}
