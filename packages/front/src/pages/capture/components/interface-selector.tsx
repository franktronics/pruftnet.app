import { useState, type ComponentPropsWithoutRef } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Button,
} from '@repo/ui/atoms'
import { cn, useQueryFetcher } from '@repo/utils'
import { fetcher } from '../../../config/client-trpc'
import type { NetworkInterfaceInfo } from '@repo/core-node/types'
import { useScanControlContext } from '../context/scan-control-context'
import { ChevronDown, CircleSmall } from 'lucide-react'

type InterfaceSelectorProps = {} & ComponentPropsWithoutRef<'div'>

export const InterfaceSelector = (props: InterfaceSelectorProps) => {
    const { ...rest } = props
    const [open, setOpen] = useState(false)
    const { setInterface, interf: selectedInterface } = useScanControlContext()

    const { data } = useQueryFetcher({
        enabled: open,
        staleTime: 60 * 1000, // 1 minute
        procedure: fetcher.interfaces.query({}),
        queryKey: ['interfaces'],
        popupOnError: true,
    })

    const handleSelectInterface = (name: string, infos: NetworkInterfaceInfo[]) => {
        setInterface((old) => {
            return { ...old, name, infos }
        })
        setOpen(false)
    }

    return (
        <div {...rest}>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-45 justify-between"
                        role="combobox"
                        aria-expanded={open}
                    >
                        <span className="truncate">
                            {selectedInterface?.name || 'Select Interface'}
                        </span>
                        <ChevronDown
                            className={cn('ml-2 size-4 shrink-0 opacity-50', {
                                'rotate-180': open,
                            })}
                        />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="scrollbar-thin max-h-100 min-w-70 overflow-y-auto p-2"
                >
                    {Object.keys(data ?? {}).length === 0 ? (
                        <span className="text-muted-foreground px-2 py-1 text-sm">
                            No interfaces found
                        </span>
                    ) : null}
                    {Object.entries(data ?? {}).map(([name, infos]) => (
                        <DropdownMenuItem
                            key={name}
                            onSelect={() => handleSelectInterface(name, infos || [])}
                        >
                            <InterfaceCard
                                name={name}
                                data={infos || []}
                                isSelected={selectedInterface?.name === name}
                            />
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}

type InterfaceCardProps = {
    data: NetworkInterfaceInfo[]
    name: string
    isSelected: boolean
} & ComponentPropsWithoutRef<'div'>

const InterfaceCard = (props: InterfaceCardProps) => {
    const { data, name, isSelected, ...rest } = props

    const macAddress = data.find((info) => !!info.mac)?.mac
    const ipv4Info = data.find((info) => info.family === 'IPv4')
    const ipv6Info = data.find((info) => info.family === 'IPv6')

    return (
        <div {...rest} className="flex w-full items-center justify-between gap-2">
            <div className="flex flex-col">
                <span className="font-medium">{name}</span>
                <span className="text-muted-foreground text-xs">MAC: {macAddress ?? ''}</span>
                <span className="text-muted-foreground text-xs">
                    IPv4: {ipv4Info ? ipv4Info.address : ''}
                </span>
                <span className="text-muted-foreground text-xs">
                    IPv6: {ipv6Info ? ipv6Info.address : ''}
                </span>
            </div>
            <div className="shrink-0">
                <CircleSmall
                    className={cn('text-muted-foreground size-4', {
                        'fill-foreground text-foreground': isSelected,
                    })}
                />
            </div>
        </div>
    )
}
