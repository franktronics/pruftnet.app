import { GraphExecutor } from './executor'
import { validateGraphPlan, type GraphPlan } from './plan'
import { NodeRegistry } from './registry'
import { registerDefaultNodes } from './register'
import { reactFlowToGraphPlan } from './reactflow-plan'

export const runGraph = async (plan: GraphPlan) => {
    const validatedPlan = validateGraphPlan(plan)
    const registry = new NodeRegistry()
    registerDefaultNodes(registry)
    const executor = new GraphExecutor(registry)
    return executor.execute(validatedPlan)
}

export const runReactFlowGraph = async (rfGraph: unknown) => {
    const plan = reactFlowToGraphPlan(rfGraph as any)
    return runGraph(plan)
}
