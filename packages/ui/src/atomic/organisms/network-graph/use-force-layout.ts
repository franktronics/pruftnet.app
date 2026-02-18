import { useEffect, useRef, useCallback } from 'react'
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
    type SimulationNodeDatum,
    type SimulationLinkDatum,
} from 'd3-force'
import type { Node, Edge } from '@xyflow/react'

export type UseForceLayoutOptions = {
    strength?: number
    distance?: number
    enabled?: boolean
    alphaDecay?: number
    velocityDecay?: number
}

type ForceNode = SimulationNodeDatum & {
    id: string
    fx?: number | null
    fy?: number | null
}

type ForceLink = SimulationLinkDatum<ForceNode> & {
    source: string
    target: string
}

export const useForceLayout = (
    nodes: Node[],
    edges: Edge[],
    setNodes: (updater: (nodes: Node[]) => Node[]) => void,
    options: UseForceLayoutOptions = {},
) => {
    const {
        strength = -100,
        distance = 100,
        enabled = true,
        alphaDecay = 0.02,
        velocityDecay = 0.4,
    } = options
    const simulationRef = useRef<ReturnType<typeof forceSimulation<ForceNode>> | null>(null)
    const nodesRef = useRef<ForceNode[]>([])
    const draggedNodeRef = useRef<string | null>(null)

    useEffect(() => {
        if (!enabled || nodes.length === 0) {
            return
        }

        const forceNodes: ForceNode[] = nodes.map((node) => {
            const existingNode = nodesRef.current.find((n) => n.id === node.id)
            return {
                id: node.id,
                x: existingNode?.x ?? node.position.x,
                y: existingNode?.y ?? node.position.y,
                fx: null,
                fy: null,
            }
        })

        nodesRef.current = forceNodes

        const forceLinks: ForceLink[] = edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
        }))

        if (simulationRef.current) {
            simulationRef.current.stop()
        }

        const simulation = forceSimulation<ForceNode>(forceNodes)
            .force(
                'link',
                forceLink<ForceNode, ForceLink>(forceLinks)
                    .id((d) => d.id)
                    .distance(distance)
                    .strength(0.5),
            )
            .force('charge', forceManyBody<ForceNode>().strength(strength))
            .force('center', forceCenter<ForceNode>(0, 0).strength(0.05))
            .force('collide', forceCollide<ForceNode>(40))
            .alphaDecay(alphaDecay)
            .velocityDecay(velocityDecay)
            .on('tick', () => {
                setNodes((prevNodes) =>
                    prevNodes.map((node) => {
                        const forceNode = nodesRef.current.find((n) => n.id === node.id)
                        if (!forceNode || node.id === draggedNodeRef.current) {
                            return node
                        }

                        return {
                            ...node,
                            position: {
                                x: forceNode.x ?? node.position.x,
                                y: forceNode.y ?? node.position.y,
                            },
                        }
                    }),
                )
            })

        simulationRef.current = simulation

        return () => {
            simulation.stop()
        }
    }, [edges, strength, distance, enabled, alphaDecay, velocityDecay, setNodes])

    const fixNodePosition = useCallback((nodeId: string, x: number, y: number) => {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (node) {
            node.fx = x
            node.fy = y
        }
        draggedNodeRef.current = nodeId
    }, [])

    const releaseNodePosition = useCallback((nodeId: string) => {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (node) {
            node.fx = null
            node.fy = null
        }
        draggedNodeRef.current = null
        if (simulationRef.current) {
            simulationRef.current.alpha(0.3).restart()
        }
    }, [])

    const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (node) {
            node.fx = x
            node.fy = y
            node.x = x
            node.y = y
        }
    }, [])

    return {
        fixNodePosition,
        releaseNodePosition,
        updateNodePosition,
    }
}
