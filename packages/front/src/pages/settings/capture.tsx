import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Checkbox,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
} from '@repo/ui/atoms'

export function CaptureSettings() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Analysis</h3>
                <p className="text-muted-foreground text-sm">
                    Configure packet capture and protocol analysis settings.
                </p>
            </div>
            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Packet Capture</CardTitle>
                    <CardDescription>Configure packet capture behavior and limits.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="packet-limit">Maximum Packet Buffer Size</Label>
                        <Input
                            id="packet-limit"
                            type="number"
                            placeholder="10000"
                            defaultValue="10000"
                        />
                        <p className="text-muted-foreground text-xs">
                            Maximum number of packets to keep in memory before discarding old ones.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="capture-filter">Default Capture Filter</Label>
                        <Input id="capture-filter" placeholder="tcp or udp" defaultValue="" />
                        <p className="text-muted-foreground text-xs">
                            BPF filter syntax (e.g., "tcp port 80" or "host 192.168.1.1").
                        </p>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox id="promiscuous" defaultChecked />
                        <Label
                            htmlFor="promiscuous"
                            className="text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Enable promiscuous mode
                        </Label>
                    </div>

                    <Button>Save changes</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Protocol Analysis</CardTitle>
                    <CardDescription>
                        Configure protocol detection and analysis options.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="protocol-depth">Analysis Depth</Label>
                        <Select defaultValue="full">
                            <SelectTrigger id="protocol-depth">
                                <SelectValue placeholder="Select depth" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="basic">Basic (Layer 2-3)</SelectItem>
                                <SelectItem value="standard">Standard (Layer 2-4)</SelectItem>
                                <SelectItem value="full">Full (All Layers)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                            Higher depth provides more detailed analysis but uses more resources.
                        </p>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox id="auto-detect" defaultChecked />
                        <Label
                            htmlFor="auto-detect"
                            className="text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Auto-detect protocols
                        </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Checkbox id="decode-payload" />
                        <Label
                            htmlFor="decode-payload"
                            className="text-sm leading-none font-normal peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Decode application-layer payloads
                        </Label>
                    </div>

                    <Button>Save changes</Button>
                </CardContent>
            </Card>
        </div>
    )
}
