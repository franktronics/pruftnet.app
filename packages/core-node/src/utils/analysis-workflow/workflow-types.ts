import { WorkflowStepOutput } from './workflow-step'

export type WorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowExecutionResult {
    readonly statusByNodeId: Map<string, WorkflowNodeStatus>
    readonly outputByNodeId: Map<string, WorkflowStepOutput>
    readonly errorByNodeId: Map<string, Error>
}

export type WorkflowEvent =
    | {
          readonly type: 'node-status'
          readonly nodeId: string
          readonly status: WorkflowNodeStatus
      }
    | {
          readonly type: 'node-error'
          readonly nodeId: string
          readonly errorMessage: string
      }
    | {
          readonly type: 'workflow-complete'
          readonly result: WorkflowExecutionResult
      }
    | {
          readonly type: 'workflow-start'
      }
export type WorkflowEventCallback = (event: WorkflowEvent) => void
