import { z } from 'zod'
import { useReactFlow, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { ArrowDown } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { ComponentProps } from 'react'
import { useAppForm, withForm } from '../../../molecules'
import { NodeHandle } from '../components'
import { BasicNodeData } from './utils'

const ipAddressSchema = z
    .string()
    .regex(/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/, 'Invalid IP address format')
const paramFormSchema = z.object({
    startIp: ipAddressSchema,
    endIp: ipAddressSchema,
})
type ParamFormValues = z.infer<typeof paramFormSchema>
export type IpRangeNodeData = Node<ParamFormValues & BasicNodeData, 'ip-range'>
export type IpRangeProps = {
    className?: string
} & NodeProps<IpRangeNodeData>

export const NodeIpRange = (props: IpRangeProps) => {
    const { selected = false, className } = props
    const { updateNodeData } = useReactFlow()

    const form = useAppForm({
        defaultValues: {
            startIp: props.data.startIp || '',
            endIp: props.data.endIp || '',
        },
        validators: {
            onSubmit: paramFormSchema,
        },
        onSubmit: async (values) => {
            updateNodeData(props.id, {
                startIp: values.value.startIp,
                endIp: values.value.endIp,
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
                <div className="flex-col">
                    <div className="flex items-center gap-2">
                        <div className="bg-chart-2/20 rounde flex size-4 shrink-0 items-center justify-center rounded-sm">
                            <div className="bg-chart-2 size-1.5 rounded-full"></div>
                        </div>
                        <p className="text-foreground font-mono text-xs">
                            {!!props.data.startIp ? props.data.startIp : 'xxx.xxx.xxx.xxx'}
                        </p>
                    </div>

                    <div className="flex items-center justify-center">
                        <ArrowDown className="text-muted-foreground size-3" strokeWidth={2.5} />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="bg-chart-5/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                            <div className="bg-chart-5 size-1.5 rounded-full"></div>
                        </div>
                        <p className="text-foreground font-mono text-xs">
                            {!!props.data.endIp ? props.data.endIp : 'xxx.xxx.xxx.xxx'}
                        </p>
                    </div>
                </div>
                <NodeHandle type="source" />
            </NodeLayout.Block>
            <NodeLayout.Popup title="IP Range Settings" onConfirm={handleFormSubmit}>
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
    defaultValues: { startIp: '', endIp: '' },
    props: {} as ComponentProps<'div'>,
    render: function Render(props) {
        const { form, className } = props
        return (
            <div className={cn('flex flex-col gap-4', className)}>
                <form.AppField
                    name="startIp"
                    children={(field) => (
                        <field.FormInput
                            label="Start IP Address"
                            description="Enter the starting IP address of the range."
                            placeholder="xxx.xxx.xxx.xxx"
                        />
                    )}
                />
                <form.AppField
                    name="endIp"
                    children={(field) => (
                        <field.FormInput
                            label="End IP Address"
                            description="Enter the ending IP address of the range."
                            placeholder="xxx.xxx.xxx.xxx"
                        />
                    )}
                />
            </div>
        )
    },
})
