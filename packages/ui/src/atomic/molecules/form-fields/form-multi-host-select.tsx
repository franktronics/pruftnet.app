import type { HostBaseData } from '@repo/utils'
import { ChevronDown, X } from 'lucide-react'
import { ComponentProps, useId, useMemo } from 'react'
import {
    Badge,
    Button,
    Checkbox,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '../../atoms'
import { useFieldContext } from './index'

export type FormMultiHostSelectProps = {
    label: string
    description?: string
    hosts: Map<string, HostBaseData>
    placeholder?: string
} & Omit<ComponentProps<'div'>, 'onChange'>

export function FormMultiHostSelect(props: FormMultiHostSelectProps) {
    const {
        label,
        description,
        hosts,
        placeholder = 'Select hosts to hide',
        className,
        ...rest
    } = props
    const field = useFieldContext<string[]>()
    const fieldId = useId()
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    const selectedHosts = useMemo(
        () => field.state.value.map((mac) => hosts.get(mac)).filter((host) => !!host),
        [field.state.value, hosts],
    )

    const toggleHost = (mac: string) => {
        const currentValue = field.state.value
        const nextValue = currentValue.includes(mac)
            ? currentValue.filter((value) => value !== mac)
            : [...currentValue, mac]

        field.handleChange(nextValue)
    }

    const removeHost = (mac: string) => {
        field.handleChange(field.state.value.filter((value) => value !== mac))
    }

    return (
        <Field data-invalid={isInvalid} className={className}>
            <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
            {selectedHosts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {selectedHosts.map((host) => {
                        if (!host) return null

                        return (
                            <Badge key={host.mac} variant="secondary" className="gap-1 pr-1 pl-2">
                                <span className="font-mono text-[11px]">{host.mac}</span>
                                <button
                                    type="button"
                                    className="hover:bg-muted rounded-full p-0.5"
                                    onClick={() => removeHost(host.mac)}
                                    aria-label={`Show host ${host.mac}`}
                                >
                                    <X className="size-3" />
                                </button>
                            </Badge>
                        )
                    })}
                </div>
            ) : null}

            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id={fieldId}
                        type="button"
                        variant="outline"
                        className="w-full justify-between"
                        onBlur={field.handleBlur}
                    >
                        <span className="truncate">
                            {selectedHosts.length > 0
                                ? `${selectedHosts.length} hidden host${selectedHosts.length > 1 ? 's' : ''}`
                                : placeholder}
                        </span>
                        <ChevronDown className="text-muted-foreground size-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[22rem] p-2" align="start" {...rest}>
                    <div className="space-y-1">
                        {Array.from(hosts.values()).length === 0 ? (
                            <div className="text-muted-foreground px-3 py-4 text-sm">
                                No host available yet.
                            </div>
                        ) : null}

                        {Array.from(hosts.values()).map((host) => {
                            const checked = field.state.value.includes(host.mac)

                            return (
                                <div
                                    key={host.mac}
                                    role="button"
                                    tabIndex={0}
                                    className="hover:bg-accent hover:text-accent-foreground flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors"
                                    onClick={() => toggleHost(host.mac)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault()
                                            toggleHost(host.mac)
                                        }
                                    }}
                                >
                                    <Checkbox checked={checked} className="mt-0.5" />
                                    <div className="min-w-0 space-y-1">
                                        <p className="font-mono text-sm">{host.mac}</p>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {formatHostOptionLabel(host)}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </PopoverContent>
            </Popover>

            {!isInvalid && !!description ? (
                <FieldDescription>{description}</FieldDescription>
            ) : null}
            {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
        </Field>
    )
}

function formatHostOptionLabel(host: HostBaseData): string {
    const truncatedVendor = host.vendor
        ? `${host.vendor.slice(0, 10)}${host.vendor.length > 10 ? '...' : ''}`
        : 'Unknown vendor'

    const address = host.ipv4 || host.ipv6

    return address ? `${truncatedVendor} - ${address}` : truncatedVendor
}
