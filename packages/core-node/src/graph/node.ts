import { z } from 'zod'

export interface GraphNode<Input = unknown, Output = unknown> {
    readonly type: string
    inputSchema: z.ZodType<Input>
    outputSchema: z.ZodType<Output>
    mergeInputs(inputs: unknown[]): Input
    run(input: Input, nodeData: unknown): Promise<Output> | Output
}
