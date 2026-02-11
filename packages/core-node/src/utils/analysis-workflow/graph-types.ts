export interface GraphNode {
    id: string
    type: string
    data?: unknown
}

export interface GraphEdge {
    source: string
    target: string
}

export interface ReactFlowGraph {
    nodes: GraphNode[]
    edges: GraphEdge[]
}
