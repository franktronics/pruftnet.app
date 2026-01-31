import { GraphPlan, graphPlanSchema } from './plan'
import { parseIp } from './utils'

type RFNode = { id: string; type?: string; data?: unknown }
type RFEdge = { source?: string; target?: string }
type RFGraph = { nodes?: RFNode[]; edges?: RFEdge[] }

export const reactFlowToGraphPlan = (rf: RFGraph): GraphPlan => {
    const nodes = (rf.nodes ?? []).map((n) => {
        if (!n.id || !n.type) {
            throw new Error('ReactFlow node must have id and type')
        }
        let data = n.data
        if (n.type === 'ip-range' && data && typeof data === 'object') {
            const startIp = (data as any).startIp as string | undefined
            const endIp = (data as any).endIp as string | undefined
            if (startIp && endIp) {
                data = {
                    start: parseIp(startIp),
                    end: parseIp(endIp),
                }
            }
        }
        return { id: n.id, type: n.type, data }
    })

    const edges = (rf.edges ?? []).map((e) => {
        if (!e.source || !e.target) {
            throw new Error('ReactFlow edge must have source and target')
        }
        return { from: e.source, to: e.target }
    })

    return graphPlanSchema.parse({ nodes, edges })
}
