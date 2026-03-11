import type { HostBaseData } from '@repo/utils'
import { cn } from '@repo/utils'
import {
    Badge,
    Button,
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@repo/ui/atoms'
import { useAppForm, withForm } from '@repo/ui/molecules'
import { Funnel } from 'lucide-react'
import { useEffect, type ComponentProps } from 'react'

export type HostFilterProps = {
    hostData: Map<string, HostBaseData>
    excludedHostMacs: string[]
    hideBroadcastHosts: boolean
    hideMulticastHosts: boolean
    hideHostsWithoutIp: boolean
    onChangeExcludedHostMacs: (excludedMacs: string[]) => void
    onChangeHideBroadcastHosts: (hide: boolean) => void
    onChangeHideMulticastHosts: (hide: boolean) => void
    onChangeHideHostsWithoutIp: (hide: boolean) => void
} & ComponentProps<'div'>

type HostFilterFormValues = {
    excludedHostMacs: string[]
    hideBroadcastHosts: boolean
    hideMulticastHosts: boolean
    hideHostsWithoutIp: boolean
}

export const HostFilter = (props: HostFilterProps) => {
    const {
        hostData,
        excludedHostMacs,
        hideBroadcastHosts,
        hideMulticastHosts,
        hideHostsWithoutIp,
        onChangeExcludedHostMacs,
        onChangeHideBroadcastHosts,
        onChangeHideMulticastHosts,
        onChangeHideHostsWithoutIp,
        className,
        ...rest
    } = props

    const form = useAppForm({
        defaultValues: {
            excludedHostMacs,
            hideBroadcastHosts,
            hideMulticastHosts,
            hideHostsWithoutIp,
        } satisfies HostFilterFormValues,
        onSubmit: async () => true,
    })

    useEffect(() => {
        form.setFieldValue('excludedHostMacs', excludedHostMacs)
        form.setFieldValue('hideBroadcastHosts', hideBroadcastHosts)
        form.setFieldValue('hideMulticastHosts', hideMulticastHosts)
        form.setFieldValue('hideHostsWithoutIp', hideHostsWithoutIp)
    }, [excludedHostMacs, hideBroadcastHosts, hideHostsWithoutIp, hideMulticastHosts])

    return (
        <div className={cn(className)} {...rest}>
            <Drawer direction="right">
                <DrawerTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 shadow-sm">
                        <Funnel className="size-4" />
                        Host filters
                        {excludedHostMacs.length > 0 ? (
                            <Badge variant="secondary" className="ml-1 px-2 py-0 text-[11px]">
                                {excludedHostMacs.length}
                            </Badge>
                        ) : null}
                    </Button>
                </DrawerTrigger>
                <DrawerContent className="h-full w-[min(92vw,30rem)] rounded-l-2xl border-l p-0 sm:max-w-none">
                    <DrawerHeader className="border-b px-6 py-5 text-left">
                        <DrawerTitle>Host filters</DrawerTitle>
                        <DrawerDescription>
                            Apply some filters and rebuild the graph automatically.
                        </DrawerDescription>
                    </DrawerHeader>

                    <div className="no-scrollbar space-y-6 overflow-y-auto px-6 py-6">
                        <HostFilterForm
                            form={form}
                            hostData={hostData}
                            onChangeExcludedHostMacs={onChangeExcludedHostMacs}
                            onChangeHideBroadcastHosts={onChangeHideBroadcastHosts}
                            onChangeHideMulticastHosts={onChangeHideMulticastHosts}
                            onChangeHideHostsWithoutIp={onChangeHideHostsWithoutIp}
                        />
                    </div>

                    <DrawerFooter className="border-t px-6 py-4">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                                onChangeExcludedHostMacs([])
                                onChangeHideBroadcastHosts(true)
                                onChangeHideMulticastHosts(true)
                                onChangeHideHostsWithoutIp(false)
                            }}
                            disabled={
                                excludedHostMacs.length === 0 &&
                                hideBroadcastHosts &&
                                hideMulticastHosts &&
                                !hideHostsWithoutIp
                            }
                        >
                            Reset filters
                        </Button>
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
        </div>
    )
}

const HostFilterForm = withForm({
    defaultValues: {
        excludedHostMacs: [] as string[],
        hideBroadcastHosts: true,
        hideMulticastHosts: true,
        hideHostsWithoutIp: false,
    },
    props: {} as {
        hostData: Map<string, HostBaseData>
        onChangeExcludedHostMacs: (excludedMacs: string[]) => void
        onChangeHideBroadcastHosts: (hide: boolean) => void
        onChangeHideMulticastHosts: (hide: boolean) => void
        onChangeHideHostsWithoutIp: (hide: boolean) => void
    },
    render: function Render(props) {
        const {
            form,
            hostData,
            onChangeExcludedHostMacs,
            onChangeHideBroadcastHosts,
            onChangeHideMulticastHosts,
            onChangeHideHostsWithoutIp,
        } = props

        return (
            <section className="space-y-4">
                <form.AppField
                    name="excludedHostMacs"
                    listeners={{
                        onChange: ({ value }) => {
                            onChangeExcludedHostMacs(value)
                        },
                    }}
                    children={(field) => (
                        <field.FormMultiHostSelect
                            label="Hidden hosts"
                            description="Select one or more hosts to exclude from the graph view."
                            hosts={hostData}
                            placeholder="Choose hosts to hide"
                        />
                    )}
                />

                <div className="space-y-3 border-t pt-4">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold">Address filters</h3>
                        <p className="text-muted-foreground text-sm">
                            Toggle automatic visibility rules for special MAC addresses.
                        </p>
                    </div>

                    <form.AppField
                        name="hideBroadcastHosts"
                        listeners={{
                            onChange: ({ value }) => {
                                onChangeHideBroadcastHosts(value)
                            },
                        }}
                        children={(field) => (
                            <field.FormCheckbox
                                label="Hide broadcast addresses"
                                description="Broadcast MAC addresses stay hidden from the graph by default."
                            />
                        )}
                    />

                    <form.AppField
                        name="hideMulticastHosts"
                        listeners={{
                            onChange: ({ value }) => {
                                onChangeHideMulticastHosts(value)
                            },
                        }}
                        children={(field) => (
                            <field.FormCheckbox
                                label="Hide multicast addresses"
                                description="Multicast MAC addresses stay hidden from the graph by default."
                            />
                        )}
                    />

                    <form.AppField
                        name="hideHostsWithoutIp"
                        listeners={{
                            onChange: ({ value }) => {
                                onChangeHideHostsWithoutIp(value)
                            },
                        }}
                        children={(field) => (
                            <field.FormCheckbox
                                label="Hide hosts without IP address"
                                description="Hide devices that currently have neither IPv4 nor IPv6 information."
                            />
                        )}
                    />
                </div>
            </section>
        )
    },
})
