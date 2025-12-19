import { useState, type ComponentPropsWithoutRef } from 'react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Button,
} from '@repo/ui/atoms'
import { useQueryFetcher } from '@repo/utils'
import { fetcher } from '../../../config/client-trpc'
import type { NetworkInterfaceInfo } from '@repo/core-node/types'
import { useScanControlContext } from '../stores/scan-control.context'

type InterfaceSelectorProps = {} & ComponentPropsWithoutRef<'div'>

export const InterfaceSelector = (props: InterfaceSelectorProps) => {
    const { ...rest } = props
    const [open, setOpen] = useState(false)
    const [interfaces, setInterfaces] = useState<
        Record<string, NetworkInterfaceInfo[] | undefined>
    >({})
    const { setInterface, interface: selectedInterface } = useScanControlContext()

    const { fetchData: getInterfaces } = useQueryFetcher({
        procedure: fetcher.interfaces.query({}),
        queryKey: ['interfaces'],
    })

    const handleOpenChange = async (isOpen: boolean) => {
        setOpen(isOpen)
        if (isOpen) {
            const result = await getInterfaces()
            const nis = result.data
            if (!nis) return
            setInterfaces(nis)
        }
    }

    const handleSelectInterface = (name: string, infos: NetworkInterfaceInfo[]) => {
        setInterface({ name, infos })
        setOpen(false)
    }

    return (
        <div {...rest}>
            <DropdownMenu open={open} onOpenChange={handleOpenChange}>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-45">
                        {selectedInterface?.name || 'Select Interface'}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="scrollbar-thin max-h-100 w-70 overflow-auto"
                >
                    {Object.entries(interfaces).map(([name, infos]) => (
                        <DropdownMenuItem
                            key={name}
                            onSelect={() => handleSelectInterface(name, infos || [])}
                        >
                            <InterfaceCard name={name} data={infos || []} />
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
} & ComponentPropsWithoutRef<'div'>

const InterfaceCard = (props: InterfaceCardProps) => {
    const { data, name, ...rest } = props

    const macAddress = data.find((info) => info.mac && info.mac !== '00:00:00:00:00:00')?.mac
    const ipv4Info = data.find((info) => info.family === 'IPv4')
    const ipv6Info = data.find((info) => info.family === 'IPv6')

    return (
        <div {...rest} className="flex flex-col">
            <span className="font-medium">{name}</span>
            {macAddress && <span className="text-muted-foreground text-xs">MAC: {macAddress}</span>}
            {ipv4Info && (
                <span className="text-muted-foreground text-xs">IPv4: {ipv4Info.address}</span>
            )}
            {ipv6Info && (
                <span className="text-muted-foreground text-xs">IPv6: {ipv6Info.address}</span>
            )}
        </div>
    )
}
