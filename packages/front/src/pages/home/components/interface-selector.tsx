import { useState, type ComponentPropsWithoutRef } from 'react'
import type { NetworkInterfaceInfo, NetworkInterfaces } from '@repo/shared/network-interface'
import {
    Button,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@repo/ui'
import { Cable, ChevronDown, EthernetPort, LoaderCircle, RotateCcwSquare, RotateCw } from 'lucide-react'

import { useGetNetworkInterfaces } from '../hooks/use-network-interfaces'

type InterfaceSelection = {
    readonly name: string
    readonly infos: ReadonlyArray<NetworkInterfaceInfo>
}

type InterfaceSelectorProps = ComponentPropsWithoutRef<'div'> & {
    readonly onChange?: (selection: InterfaceSelection) => void
}

export function InterfaceSelector({ className, onChange, ...props }: InterfaceSelectorProps) {
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState<InterfaceSelection | null>(null)
    const { data, error, isFetching, refetch } = useGetNetworkInterfaces({ enabled: open })

    const interfaces = toInterfaceEntries(data)
    const selectedName = selected?.name ?? null

    function selectInterface(selection: InterfaceSelection) {
        setSelected(selection)
        onChange?.(selection)
        setOpen(false)
    }

    return (
        <div className={className} {...props}>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                    render={
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 w-full max-w-xl justify-between px-3 text-left"
                            aria-label="Select network interface"
                        />
                    }
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <Cable className="text-muted-foreground size-4" />
                        <span className="min-w-0 truncate">
                            {selected ? selected.name : 'Select network interface'}
                        </span>
                    </span>
                    <ChevronDown
                        className={`text-muted-foreground size-4 transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))] gap-0 p-0">
                    <Command shouldFilter>
                        <CommandInput placeholder="Filter interfaces by name or address..." />
                        <CommandList className="max-h-96">
                            {isFetching ? <InterfaceLoading /> : null}
                            {error ? (
                                <InterfaceError
                                    onRetry={() => void refetch()}
                                    message={error.message}
                                />
                            ) : null}
                            {!isFetching && !error ? (
                                <CommandEmpty>No network interfaces found.</CommandEmpty>
                            ) : null}
                            {!error && interfaces.length > 0 ? (
                                <CommandGroup heading="Available interfaces">
                                    {interfaces.map((item) => (
                                        <CommandItem
                                            key={item.name}
                                            value={getSearchValue(item)}
                                            data-checked={selectedName === item.name}
                                            onSelect={() => selectInterface(item)}
                                            className="items-stretch py-2 pr-8"
                                        >
                                            <InterfaceCard item={item} />
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            ) : null}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    )
}

function toInterfaceEntries(interfaces: NetworkInterfaces | undefined): InterfaceSelection[] {
    return Object.entries(interfaces ?? {}).map(([name, infos]) => ({ name, infos }))
}

function getPrimaryAddress(infos: ReadonlyArray<NetworkInterfaceInfo>, family: 'IPv4' | 'IPv6') {
    return (
        infos.find((info) => info.family === family && !info.internal)?.address ??
        infos.find((info) => info.family === family)?.address ??
        null
    )
}

function getMacAddress(infos: ReadonlyArray<NetworkInterfaceInfo>) {
    const mac = infos.find((info) => info.mac && info.mac !== '00:00:00:00:00:00')?.mac
    return mac ?? infos.find((info) => info.mac)?.mac ?? null
}

function getInterfaceKind(infos: ReadonlyArray<NetworkInterfaceInfo>) {
    return infos.every((info) => info.internal) ? 'loopback' : 'external'
}

function getSearchValue(item: InterfaceSelection) {
    return [
        item.name,
        ...item.infos.map((info) => `${info.family} ${info.address} ${info.mac}`),
    ].join(' ')
}

function InterfaceLoading() {
    return (
        <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-xs">
            <LoaderCircle className="size-4 animate-spin" />
            Fetching network interfaces...
        </div>
    )
}

function InterfaceError({ onRetry, message }: { onRetry: () => void; message: string }) {
    return (
        <div className="border-destructive/30 bg-destructive/10 text-destructive m-2 rounded-md border p-3 text-xs">
            <p>{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="text-destructive mt-2 inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
            >
                <RotateCw className="size-3" />
                Retry
            </button>
        </div>
    )
}

function InterfaceCard({ item }: { readonly item: InterfaceSelection }) {
    const ipv4 = getPrimaryAddress(item.infos, 'IPv4')
    const ipv6 = getPrimaryAddress(item.infos, 'IPv6')
    const mac = getMacAddress(item.infos)
    const kind = getInterfaceKind(item.infos)
    const Icon = kind === 'loopback' ? RotateCcwSquare : EthernetPort

    return (
        <div className="grid w-full grid-cols-[auto_1fr] items-start gap-3">
            <span className="border-border bg-muted/40 mt-0.5 flex size-8 items-center justify-center rounded-md border">
                <Icon className="text-muted-foreground size-4" />
            </span>
            <span className="min-w-0 space-y-1">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <span className="border-border text-muted-foreground rounded-sm border px-1.5 py-0.5 text-[0.625rem] tracking-wide uppercase">
                        {kind}
                    </span>
                </span>
                <span className="text-muted-foreground grid gap-0.5 text-xs">
                    <span className="truncate">IPv4: {ipv4 ?? 'none'}</span>
                    <span className="truncate">IPv6: {ipv6 ?? 'none'}</span>
                    <span className="truncate">MAC: {mac ?? 'none'}</span>
                </span>
            </span>
        </div>
    )
}
