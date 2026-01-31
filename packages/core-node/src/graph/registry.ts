import { GraphNode } from './node'

export class NodeRegistry {
    private readonly nodes = new Map<string, GraphNode>()

    register(node: GraphNode) {
        this.nodes.set(node.type, node)
    }

    get(type: string): GraphNode | undefined {
        return this.nodes.get(type)
    }
}
