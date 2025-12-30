import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Input,
    Label,
    Separator,
    Switch,
} from '@repo/ui/atoms'
import { useId } from 'react'

export function CaptureSettings() {
    const maxPacketId = useId()
    const promiscuousId = useId()
    const protocolConfigId = useId()

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Capture</h3>
                <p className="text-muted-foreground text-sm">Configure packet capture settings.</p>
            </div>
            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Packet Capture</CardTitle>
                    <CardDescription>Configure packet capture behavior and limits.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={maxPacketId}>Maximum Packet Buffer Size</Label>
                        <Input
                            id={maxPacketId}
                            type="number"
                            placeholder="10000"
                            defaultValue="10000"
                        />
                        <p className="text-muted-foreground text-xs">
                            Maximum number of packets to keep in memory before discarding old ones.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center gap-6">
                            <Label
                                htmlFor={promiscuousId}
                                className="text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                                Promiscuous mode
                            </Label>
                            <Switch id={promiscuousId} />
                        </div>
                        <p className="text-muted-foreground text-xs">
                            Capture all packets on the network segment, not just those addressed to
                            this host.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Packet Parsing</CardTitle>
                    <CardDescription>
                        Configure how captured packets are parsed and interpreted.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor={protocolConfigId}>
                            protocol configuration input file (Ethernet file)
                        </Label>
                        <Input
                            id={protocolConfigId}
                            type="text"
                            placeholder=".../protocols/ethernet.json"
                        />
                        <p className="text-muted-foreground text-xs">
                            Path to the configuration file for the Ethernet input protocol. The path
                            to the configuration files for other protocols is defined in the
                            Ethernet configuration file.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
