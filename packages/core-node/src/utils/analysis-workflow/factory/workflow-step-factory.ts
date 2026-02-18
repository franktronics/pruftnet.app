import type { WorkflowStep } from '../workflow-step'
import { ArpScanStep } from '../steps/arp-scan-step'
import { IpRangeStep } from '../steps/ip-range-step'
import { NetOutputStep } from '../steps/net-output-step'
import { IpSingleStep } from '../steps/ip-single-step'
import { IcmpPingStep } from '../steps/icmp-ping-step'
import { Ipv6SingleStep } from '../steps/ipv6-single-step'
import { Ipv6NsStep } from '../steps/ipv6-ns-step'
import { Ipv6RsStep } from '../steps/ipv6-rs-step'
import { Icmpv6PingStep } from '../steps/icmpv6-ping-step'

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
        'ipv6-single': Ipv6SingleStep,
        'ipv6-ns': Ipv6NsStep,
        'ipv6-rs': Ipv6RsStep,
        'icmpv6-ping': Icmpv6PingStep,
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
