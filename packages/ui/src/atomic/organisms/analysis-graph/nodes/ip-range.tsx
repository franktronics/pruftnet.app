import { z } from 'zod'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cn } from '@repo/utils'
import { ArrowDown } from 'lucide-react'
import { NodeLayout } from '../nodes-layout'
import { ComponentProps, useId } from 'react'
import { useForm } from '@tanstack/react-form'
import { Field, FieldLabel, FieldDescription, FieldError, Input } from '../../../atoms'

export type IpRangeNodeData = Node<{ name: string }, 'ip-range'>
export type IpRangeProps = {
    className?: string
} & NodeProps<IpRangeNodeData>

export const IpRange = (props: IpRangeProps) => {
    const { selected = false, className } = props

    const paramForm = useForm({
        defaultValues: { startIp: '192.168.208.121', endIp: '192.168.208.128' },
        validators: {
            onChange: paramFormSchema,
        },
        onSubmit: async (values) => {
            console.log('Submitted values:', values.value)
        },
    })

    return (
        <NodeLayout.Root data={props} selected={selected} className={className}>
            <NodeLayout.Block className={className} contentClass="rounded-l-2xl p-2">
                <div className="flex-col">
                    <div className="flex items-center gap-2">
                        <div className="bg-chart-2/20 rounde flex size-4 shrink-0 items-center justify-center rounded-sm">
                            <div className="bg-chart-2 size-1.5 rounded-full"></div>
                        </div>
                        <p className="text-foreground font-mono text-xs">192.168.208.121</p>
                    </div>

                    <div className="flex items-center justify-center">
                        <ArrowDown className="text-muted-foreground size-3" strokeWidth={2.5} />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="bg-chart-5/20 flex size-4 shrink-0 items-center justify-center rounded-sm">
                            <div className="bg-chart-5 size-1.5 rounded-full"></div>
                        </div>
                        <p className="text-foreground font-mono text-xs">192.168.208.128</p>
                    </div>
                </div>

                <Handle
                    position={Position.Right}
                    type="source"
                    style={{
                        background: 'none',
                        border: 'none',
                        width: '0.75em',
                        height: '0.75em',
                    }}
                >
                    <div
                        className={cn(
                            'border-background bg-primary border-2',
                            'pointer-events-none size-3 rounded-full',
                            'absolute -right-0.5',
                        )}
                    ></div>
                </Handle>
            </NodeLayout.Block>
            <NodeLayout.Popup title="IP Range Settings">
                <NodeLayout.Params>
                    <ParamTab form={paramForm} />
                </NodeLayout.Params>
                <NodeLayout.Settings disabled={true}></NodeLayout.Settings>
            </NodeLayout.Popup>
            <NodeLayout.Menu></NodeLayout.Menu>
        </NodeLayout.Root>
    )
}

const ipAddressSchema = z
    .string()
    .regex(
        /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        'Invalid IP address format',
    )
const paramFormSchema = z.object({
    startIp: ipAddressSchema,
    endIp: ipAddressSchema,
})

type ParamTabProps = {
    form: any
} & ComponentProps<'div'>
const ParamTab = (props: ParamTabProps) => {
    const { className, form, ...rest } = props
    const fieldId = useId()

    return (
        <div className={cn('flex flex-col gap-4', className)} {...rest}>
            <form.Field
                name="startIp"
                children={(field) => {
                    const isInvalid = !field.state.meta.isValid && field.state.meta.isTouched
                    return (
                        <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={fieldId + 'start'}>Start IP Address</FieldLabel>
                            <Input
                                id={fieldId + 'start'}
                                type="text"
                                placeholder="xxx.xxx.xxx.xxx"
                                className="font-mono"
                                value={field.state.value}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                aria-invalid={isInvalid}
                            />
                            {!isInvalid ? (
                                <FieldDescription>
                                    Enter the starting IP address of the range.
                                </FieldDescription>
                            ) : (
                                <FieldError errors={field.state.meta.errors} />
                            )}
                        </Field>
                    )
                }}
            />

            <form.Field
                name="endIp"
                children={(field) => {
                    const isInvalid = !field.state.meta.isValid && field.state.meta.isTouched
                    return (
                        <Field data-invalid={isInvalid}>
                            <FieldLabel htmlFor={fieldId + 'end'}>End IP Address</FieldLabel>
                            <Input
                                id={fieldId + 'end'}
                                type="text"
                                placeholder="xxx.xxx.xxx.xxx"
                                className="font-mono"
                                value={field.state.value}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                aria-invalid={isInvalid}
                            />
                            {!isInvalid ? (
                                <FieldDescription>
                                    Enter the ending IP address of the range.
                                </FieldDescription>
                            ) : (
                                <FieldError errors={field.state.meta.errors} />
                            )}
                        </Field>
                    )
                }}
            />
        </div>
    )
}
