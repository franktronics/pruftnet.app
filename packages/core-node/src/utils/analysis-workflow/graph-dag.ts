import { ReactFlowGraph } from './graph-types'
import { validateGraph } from './graph-validation'

export interface Dag {
    adj: Map<string, string[]>
    indegree: Map<string, number>
}

export function buildDag(graph: ReactFlowGraph): Dag {
    const adj = new Map<string, string[]>()
    const indegree = new Map<string, number>()

    for (const node of graph.nodes) {
        adj.set(node.id, [])
        indegree.set(node.id, 0)
    }

    for (const edge of graph.edges) {
        adj.get(edge.source)!.push(edge.target)
        indegree.set(edge.target, indegree.get(edge.target)! + 1)
    }

    return { adj, indegree }
}

export function assertAcyclic(dag: Dag): void {
    const indegree = new Map(dag.indegree)
    const queue: string[] = []

    for (const [nodeId, count] of indegree) {
        if (count === 0) {
            queue.push(nodeId)
        }
    }

    let resolved = 0

    while (queue.length) {
        const current = queue.shift()!
        resolved++

        for (const next of dag.adj.get(current)!) {
            indegree.set(next, indegree.get(next)! - 1)
            if (indegree.get(next) === 0) {
                queue.push(next)
            }
        }
    }

    if (resolved !== indegree.size) {
        throw new Error('Cycle detected in workflow graph')
    }
}

export function prepareGraph(graph: ReactFlowGraph): Dag {
    validateGraph(graph)
    const dag = buildDag(graph)
    assertAcyclic(dag)
    return dag
}
