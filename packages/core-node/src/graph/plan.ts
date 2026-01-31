import { z } from 'zod'

export const graphNodeSchema = z.object({
    id: z.string(),
    type: z.string(),
    data: z.unknown(),
})

export const graphEdgeSchema = z.object({
    from: z.string(),
    to: z.string(),
})

export const graphPlanSchema = z.object({
    nodes: z.array(graphNodeSchema),
    edges: z.array(graphEdgeSchema),
})

export type GraphNodePlan = z.infer<typeof graphNodeSchema>
export type GraphEdgePlan = z.infer<typeof graphEdgeSchema>
export type GraphPlan = z.infer<typeof graphPlanSchema>

export const buildAdjacency = (plan: GraphPlan) => {
    const parents = new Map<string, Set<string>>()
    const children = new Map<string, Set<string>>()

    for (const node of plan.nodes) {
        parents.set(node.id, new Set())
        children.set(node.id, new Set())
    }

    for (const edge of plan.edges) {
        if (!parents.has(edge.to) || !children.has(edge.from)) {
            continue
        }
        parents.get(edge.to)?.add(edge.from)
        children.get(edge.from)?.add(edge.to)
    }

    return { parents, children }
}

export const topologicalSort = (plan: GraphPlan): string[] => {
    const { parents, children } = buildAdjacency(plan)
    const inDegree = new Map<string, number>()

    for (const node of plan.nodes) {
        inDegree.set(node.id, parents.get(node.id)?.size ?? 0)
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id)
    }

    const order: string[] = []
    while (queue.length > 0) {
        const current = queue.shift() as string
        order.push(current)
        for (const child of children.get(current) ?? []) {
            const next = (inDegree.get(child) ?? 0) - 1
            inDegree.set(child, next)
            if (next === 0) queue.push(child)
        }
    }

    if (order.length !== plan.nodes.length) {
        throw new Error('Graph contains a cycle or disconnected reference')
    }

    return order
}

export const validateGraphPlan = (input: unknown): GraphPlan => {
    const plan = graphPlanSchema.parse(input)
    topologicalSort(plan)
    return plan
}
