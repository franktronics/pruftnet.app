import { z } from 'zod'
import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { NodeLayout } from '../nodes-layout'
import { ComponentProps } from 'react'
import { useAppForm, withForm } from '../../../molecules'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

const paramFormSchema = z.object({
    ipAddress: z
        .string()
        .regex(/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/, 'Invalid IP address format'),
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type IpSingleNodeData = Node<ParamFormValues & BasicNodeData, 'ip-single'>
export type IpSingleProps = {
    className?: string
} & NodeProps<IpSingleNodeData>

export const NodeIpSingle = (props: IpSingleProps) => {
    const { selected = false, className } = props
    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: {
            ipAddress: props.data.ipAddress || '',
        },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                ipAddress: values.value.ipAddress,
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
            <NodeLayout.Block className={className} contentClass="rounded-l-2xl p-2">
                <div className="flex items-center gap-2">
                    <div className="bg-chart-1/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                        <div className="bg-chart-1 size-1.5 rounded-full"></div>
                    </div>
                    <p className="text-foreground font-mono text-xs">
                        {!!props.data.ipAddress ? props.data.ipAddress : 'xxx.xxx.xxx.xxx'}
                    </p>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="Single IP Settings" onConfirm={handleFormSubmit}>
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
    defaultValues: { ipAddress: '' },
    props: {} as ComponentProps<'div'>,
    render: function Render(props) {
        const { form, className } = props
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <form.AppField
                    name="ipAddress"
                    children={(field) => (
                        <field.FormInput
                            label="IP Address"
                            description="Enter the IP address."
                            placeholder="xxx.xxx.xxx.xxx"
                        />
                    )}
                />
            </div>
        )
    },
})
