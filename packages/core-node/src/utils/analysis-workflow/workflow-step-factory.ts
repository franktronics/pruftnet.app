import type { WorkflowStep } from './workflow-step'
import { ArpScanStep } from './steps/arp-scan-step'
import { IpRangeStep } from './steps/ip-range-step'
import { NetOutputStep } from './steps/net-output-step'
import { IpSingleStep } from './steps/ip-single-step'
import { IcmpPingStep } from './steps/icmp-ping-step'

export abstract class WorkflowStepFactory {
    public abstract create(type: string): WorkflowStep
}

export class WorkflowStepFactoryImpl extends WorkflowStepFactory {
    private readonly stepsByType: Record<string, any> = {
        'ip-range': IpRangeStep,
        'ip-single': IpSingleStep,
        'arp-scan': ArpScanStep,
        'icmp-ping': IcmpPingStep,
        'net-output': NetOutputStep,
    }

    public create(type: string): WorkflowStep {
        const StepClass = this.stepsByType[type]
        if (!StepClass) {
            throw new Error(`Unsupported step type: ${type}`)
        }
        return new StepClass()
    }

    static make() {
        return new WorkflowStepFactoryImpl()
    }
}
