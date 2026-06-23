import { useMemo, useState, type ComponentPropsWithoutRef } from 'react'
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
import { Cable, ChevronDown, EthernetPort, LoaderCircle, RotateCcwSquare } from 'lucide-react'

import { BasicErrorAlert } from '#/components/error-renderer'
import { useGetNetworkInterfaces } from '../hooks/use-network-interfaces'

type InterfaceEntry = {
    readonly name: string
    readonly infos: ReadonlyArray<NetworkInterfaceInfo>
    readonly kind: InterfaceKind
    readonly ipv4: string | null
    readonly ipv6: string | null
    readonly mac: string | null
    readonly priority: number
    readonly searchValue: string
}

type InterfaceKind = 'loopback' | 'external'

type InterfaceSelectorProps = ComponentPropsWithoutRef<'div'> & {
    readonly onChange?: (selection: InterfaceEntry) => void
}

export function InterfaceSelector({ className, onChange, ...props }: InterfaceSelectorProps) {
    const [open, setOpen] = useState(false)
    const [selectedName, setSelectedName] = useState<string | null>(null)
    const { data, error, isFetching, refetch } = useGetNetworkInterfaces({ enabled: open })

    const interfaces = useMemo(() => toInterfaceEntries(data), [data])
    const selected = selectedName ? (interfaces.find((item) => item.name === selectedName) ?? null) : null

    function selectInterface(selection: InterfaceEntry) {
        setSelectedName(selection.name)
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
                        {selected ? (
                            <InterfaceKindIcon kind={selected.kind} className="text-muted-foreground size-4" />
                        ) : (
                            <Cable className="text-muted-foreground size-4" />
                        )}
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
                                <div className="p-2">
                                    <BasicErrorAlert error={error} onRetry={() => void refetch()} />
                                </div>
                            ) : null}
                            {!isFetching && !error ? <CommandEmpty>No matching interfaces found.</CommandEmpty> : null}
                            {!error && interfaces.length > 0 ? (
                                <CommandGroup heading="Available interfaces">
                                    {interfaces.map((item) => (
                                        <CommandItem
                                            key={item.name}
                                            value={item.searchValue}
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

function toInterfaceEntries(interfaces: NetworkInterfaces | undefined): InterfaceEntry[] {
    return Object.entries(interfaces ?? {})
        .map(([name, infos]) => toInterfaceEntry(name, infos))
        .sort(compareInterfaceSelections)
}

function toInterfaceEntry(name: string, infos: ReadonlyArray<NetworkInterfaceInfo>): InterfaceEntry {
    let firstIpv4: string | null = null
    let externalIpv4: string | null = null
    let firstIpv6: string | null = null
    let externalIpv6: string | null = null
    let firstMac: string | null = null
    let realMac: string | null = null
    let hasExternalAddress = false

    const searchParts = [name]

    for (const info of infos) {
        searchParts.push(`${info.family} ${info.address} ${info.mac}`)

        if (!info.internal) {
            hasExternalAddress = true
        }

        if (info.family === 'IPv4') {
            firstIpv4 ??= info.address
            if (!info.internal) {
                externalIpv4 ??= info.address
            }
        }

        if (info.family === 'IPv6') {
            firstIpv6 ??= info.address
            if (!info.internal) {
                externalIpv6 ??= info.address
            }
        }

        if (info.mac) {
            firstMac ??= info.mac
            if (info.mac !== '00:00:00:00:00:00') {
                realMac ??= info.mac
            }
        }
    }

    const hasExternalIpv4 = externalIpv4 !== null
    const hasExternalIpv6 = externalIpv6 !== null
    const hasRealMac = realMac !== null

    return {
        name,
        infos,
        kind: hasExternalAddress ? 'external' : 'loopback',
        ipv4: externalIpv4 ?? firstIpv4,
        ipv6: externalIpv6 ?? firstIpv6,
        mac: realMac ?? firstMac,
        priority:
            (hasExternalAddress ? 8 : 0) +
            (hasRealMac ? 4 : 0) +
            (hasExternalIpv4 ? 2 : 0) +
            (hasExternalIpv6 ? 1 : 0),
        searchValue: searchParts.join(' '),
    }
}

function compareInterfaceSelections(a: InterfaceEntry, b: InterfaceEntry) {
    const scoreDiff = b.priority - a.priority
    return scoreDiff || a.name.localeCompare(b.name)
}

function InterfaceLoading() {
    return (
        <div className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-xs">
            <LoaderCircle className="size-4 animate-spin" />
            Fetching network interfaces...
        </div>
    )
}

function InterfaceKindIcon({ kind, className }: { readonly kind: InterfaceKind; readonly className?: string }) {
    return kind === 'loopback' ? (
        <RotateCcwSquare className={className} />
    ) : (
        <EthernetPort className={className} />
    )
}

function InterfaceCard({ item }: { readonly item: InterfaceEntry }) {
    return (
        <div className="grid w-full grid-cols-[auto_1fr] items-start gap-3">
            <span className="border-border bg-muted/40 mt-0.5 flex size-8 items-center justify-center rounded-md border">
                <InterfaceKindIcon kind={item.kind} className="text-muted-foreground size-4" />
            </span>
            <span className="min-w-0 space-y-1">
                <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.name}</span>
                    <span className="border-border text-muted-foreground rounded-sm border px-1.5 py-0.5 text-[0.625rem] tracking-wide uppercase">
                        {item.kind}
                    </span>
                </span>
                <span className="text-muted-foreground grid gap-0.5 text-xs">
                    <span className="truncate">IPv4: {item.ipv4 ?? 'none'}</span>
                    <span className="truncate">IPv6: {item.ipv6 ?? 'none'}</span>
                    <span className="truncate">MAC: {item.mac ?? 'none'}</span>
                </span>
            </span>
        </div>
    )
}
