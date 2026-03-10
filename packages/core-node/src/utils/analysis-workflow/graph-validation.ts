import { ReactFlowGraph } from './graph-types'

export function validateGraph(graph: ReactFlowGraph) {
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
        throw new Error('Graph has no nodes')
    }
    if (!graph.edges) {
        throw new Error('Graph has no edges')
    }

    const nodeIds = new Set<string>()

    for (const node of graph.nodes) {
        if (nodeIds.has(node.id)) {
            throw new Error(`Duplicate node id: ${node.id}`)
        }
        nodeIds.add(node.id)
    }

    for (const edge of graph.edges) {
        if (!nodeIds.has(edge.source)) {
            throw new Error(`Edge source not found: ${edge.source}`)
        }
        if (!nodeIds.has(edge.target)) {
            throw new Error(`Edge target not found: ${edge.target}`)
        }
    }
    return true
}
