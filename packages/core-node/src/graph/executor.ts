import { GraphPlan, buildAdjacency, topologicalSort } from './plan'
import { NodeRegistry } from './registry'

export type ExecutionResult = Map<string, unknown>

export class GraphExecutor {
    constructor(private readonly registry: NodeRegistry) {}

    async execute(plan: GraphPlan): Promise<ExecutionResult> {
        const order = topologicalSort(plan)
        const { parents } = buildAdjacency(plan)
        const output = new Map<string, unknown>()

        for (const nodeId of order) {
            const nodePlan = plan.nodes.find((n) => n.id === nodeId)
            if (!nodePlan) {
                throw new Error(`Node ${nodeId} not found in plan`)
            }

            const nodeImpl = this.registry.get(nodePlan.type)
            if (!nodeImpl) {
                throw new Error(`No implementation registered for node type ${nodePlan.type}`)
            }

            const parentIds = Array.from(parents.get(nodeId) ?? [])
            const parentOutputs = parentIds.map((pid) => output.get(pid))

            const mergedInput = nodeImpl.mergeInputs(parentOutputs)
            const validatedInput = nodeImpl.inputSchema.parse(mergedInput)
            const result = await nodeImpl.run(validatedInput, nodePlan.data)
            const validatedOutput = nodeImpl.outputSchema.parse(result)

            output.set(nodeId, validatedOutput)
        }

        return output
    }
}
