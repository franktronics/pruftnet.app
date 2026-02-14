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
    delay: z.number().min(0).max(5000).describe('Delay between ICMP requests in milliseconds'),
    identifier: z.number().min(0).max(65535).describe('Identifier for the ICMP packets'),
    sequenceStart: z
        .number()
        .min(0)
        .max(65535)
        .describe('Starting sequence number for the ICMP packets'),
    dataSize: z.number().min(0).max(1472).describe('Size of the ICMP packet data in bytes'),
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type IcmpNodeNodeData = Node<ParamFormValues & BasicNodeData, 'icmp-ping'>
export type IcmpPingProps = {
    className?: string
} & NodeProps<IcmpNodeNodeData>

export const NodeIcmpPing = (props: IcmpPingProps) => {
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
                            'bg-primary/10 text-primary rounded-full transition-colors',
                            'flex size-9 shrink-0 items-center justify-center',
                        )}
                    >
                        <Popsicle className="size-5" />
                    </div>
                    <div>ICMP Ping</div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="ICMP Ping node" onConfirm={handleFormSubmit}>
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
        // just for typesafety, the actual default values are set in the form hook
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
                            description="Enter the delay between ICMP requests in milliseconds."
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
                            description="Enter the size of the ICMP packet data in bytes."
                            placeholder="0-1472"
                        />
                    )}
                />
            </div>
        )
    },
})
