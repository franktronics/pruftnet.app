import { useReactFlow, useStore, useStoreApi, type ReactFlowState } from '@xyflow/react'
import { Plus, Minus, Maximize2, Lock, Unlock } from 'lucide-react'
import { cn } from '@repo/utils'
import { Button } from '../../../atoms'

const isInteractiveSelector = (s: ReactFlowState) =>
    s.nodesDraggable && s.nodesConnectable && s.elementsSelectable

export type GraphControlsProps = {
    className?: string
}

export const GraphControls = (props: GraphControlsProps) => {
    const { className } = props
    const { zoomIn, zoomOut, fitView } = useReactFlow()
    const store = useStoreApi()
    const isInteractive = useStore(isInteractiveSelector)
    const zoom = useStore((s: ReactFlowState) => s.transform[2])
    const minZoom = useStore((s: ReactFlowState) => s.minZoom)
    const maxZoom = useStore((s: ReactFlowState) => s.maxZoom)

    const isZoomInDisabled = zoom >= maxZoom
    const isZoomOutDisabled = zoom <= minZoom

    const onToggleInteractivity = () => {
        store.setState({
            nodesDraggable: !isInteractive,
            nodesConnectable: !isInteractive,
            elementsSelectable: !isInteractive,
        })
    }

    return (
        <div
            className={cn(
                'react-flow__controls bg-background absolute bottom-4 left-4 z-10 flex flex-col gap-1 rounded-lg border p-1 shadow-md',
                className,
            )}
        >
            <Button
                variant="outline"
                size="icon"
                className="hover:bg-accent size-8 border-0"
                onClick={() => zoomIn()}
                disabled={isZoomInDisabled}
                title="Zoom in"
                aria-label="Zoom in"
            >
                <Plus className="size-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                className="hover:bg-accent size-8 border-0"
                onClick={() => zoomOut()}
                disabled={isZoomOutDisabled}
                title="Zoom out"
                aria-label="Zoom out"
            >
                <Minus className="size-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                className="hover:bg-accent size-8 border-0"
                onClick={() => fitView()}
                title="Fit view"
                aria-label="Fit view"
            >
                <Maximize2 className="size-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                className="hover:bg-accent size-8 border-0"
                onClick={onToggleInteractivity}
                title={isInteractive ? 'Lock' : 'Unlock'}
                aria-label={isInteractive ? 'Lock' : 'Unlock'}
            >
                {isInteractive ? <Unlock className="size-4" /> : <Lock className="size-4" />}
            </Button>
        </div>
    )
}
