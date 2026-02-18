import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { z } from 'zod'
import { cn } from '@repo/utils'
import { Popsicle } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { useAppForm, withForm } from '../../../molecules'
import { ComponentProps } from 'react'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

const paramFormSchema = z.object({
    delay: z.number().min(0).max(5000).describe('Delay between ICMPv6 requests in milliseconds'),
    identifier: z.number().min(0).max(65535).describe('Identifier for the ICMPv6 packets'),
    sequenceStart: z
        .number()
        .min(0)
        .max(65535)
        .describe('Starting sequence number for the ICMPv6 packets'),
    dataSize: z.number().min(0).max(1232).describe('Size of the ICMPv6 packet data in bytes'),
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type Icmpv6PingNodeData = Node<ParamFormValues & BasicNodeData, 'icmpv6-ping'>
export type Icmpv6PingProps = {
    className?: string
} & NodeProps<Icmpv6PingNodeData>

export const NodeIcmpv6Ping = (props: Icmpv6PingProps) => {
    const { selected = false, className } = props

    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: {
            delay: props.data.delay || 0,
            identifier: props.data.identifier || Math.floor(Math.random() * 65536),
            sequenceStart: props.data.sequenceStart || 1,
            dataSize: props.data.dataSize || 32,
        },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                delay: values.value.delay,
                identifier: values.value.identifier,
                sequenceStart: values.value.sequenceStart,
                dataSize: values.value.dataSize,
            })
            return true
        },
    })

    const handleFormSubmit = async (): Promise<boolean> => {
        await form.handleSubmit()
        return form.state.isSubmitted
    }

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block>
                <NodeHandle type="target" />
                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            'bg-chart-2/10 text-chart-2 rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Popsicle className="size-5" />
                    </div>
                    <div>ICMPv6 Ping</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="ICMPv6 Ping Node" onConfirm={handleFormSubmit}>
                <NodeLayout.Params>
                    <ParamTab form={form} />
                </NodeLayout.Params>
                <NodeLayout.Settings disabled={true}></NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

const ParamTab = withForm({
    defaultValues: {
        delay: 0,
        identifier: 0,
        sequenceStart: 1,
        dataSize: 32,
    },
    props: {} as ComponentProps<'div'>,
    render: function Render(props) {
        const { form, className } = props
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <form.AppField
                    name="delay"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Delay (ms)"
                            description="Enter the delay between ICMPv6 Echo Requests in milliseconds."
                            placeholder="0-5000"
                        />
                    )}
                />
                <form.AppField
                    name="identifier"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Identifier"
                            description="All packets sent by this node will have the same identifier. You can use this to match requests and responses."
                            placeholder="0-65535"
                        />
                    )}
                />
                <form.AppField
                    name="sequenceStart"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Sequence Start"
                            description="The packets will be sent with incrementing sequence numbers starting from this value."
                            placeholder="0-65535"
                        />
                    )}
                />
                <form.AppField
                    name="dataSize"
                    children={(field) => (
                        <field.FormInput
                            type="number"
                            label="Data Size (bytes)"
                            description="Enter the size of the ICMPv6 packet data in bytes. Maximum 1232 for IPv6."
                            placeholder="0-1232"
                        />
                    )}
                />
            </div>
        )
    },
})
