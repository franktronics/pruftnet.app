import { GraphPlan, graphPlanSchema } from './plan'

type RFNode = { id: string; type?: string; data?: unknown }
type RFEdge = { source?: string; target?: string }
type RFGraph = { nodes?: RFNode[]; edges?: RFEdge[] }

export const reactFlowToGraphPlan = (rf: RFGraph): GraphPlan => {
    const nodes = (rf.nodes ?? []).map((n) => {
        if (!n.id || !n.type) {
            throw new Error('ReactFlow node must have id and type')
        }
        return { id: n.id, type: n.type, data: n.data }
    })

    const edges = (rf.edges ?? []).map((e) => {
        if (!e.source || !e.target) {
            throw new Error('ReactFlow edge must have source and target')
        }
        return { from: e.source, to: e.target }
    })

    return graphPlanSchema.parse({ nodes, edges })
}
