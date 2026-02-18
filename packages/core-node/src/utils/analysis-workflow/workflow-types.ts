import { WorkflowStepOutput } from './workflow-step'

export type WorkflowNodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowExecutionResult {
    readonly statusByNodeId: Map<string, WorkflowNodeStatus>
    readonly outputByNodeId: Map<string, WorkflowStepOutput>
    readonly errorByNodeId: Map<string, Error>
}

export type WorkflowEventData =
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
          readonly type: 'node-info'
          readonly nodeId: string
          readonly message: string
      }
    | {
          readonly type: 'node-warning'
          readonly nodeId: string
          readonly message: string
      }
    | {
          readonly type: 'workflow-complete'
          readonly result: WorkflowExecutionResult
      }
    | {
          readonly type: 'workflow-start'
      }

export type WorkflowEvent = WorkflowEventData & { readonly timestamp: number }

export class WorkflowEventFactory {
    static create<T extends WorkflowEventData>(data: T): T & { timestamp: number } {
        return {
            ...data,
            timestamp: Date.now(),
        }
    }
}

export type WorkflowEventCallback = (event: WorkflowEvent) => void
