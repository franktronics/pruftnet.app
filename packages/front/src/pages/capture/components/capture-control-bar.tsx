import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { CaptureInterface, CaptureSession } from '@repo/shared/capture'
import {
    Button,
    Checkbox,
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    NativeSelect,
    NativeSelectOption,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Switch,
} from '@repo/ui'
import { ChevronDown, Pause, Play, RefreshCw, Settings2, Square } from 'lucide-react'
import { useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { BasicErrorAlert } from '#front/components/error-renderer'
import { DesktopTitlebarTarget } from '#front/components/desktop-titlebar-context'
import { queryClient } from '#front/config/query-client'
import { captureCapabilitiesOptions, captureKeys } from '#front/pages/capture/api/capture-queries'
import {
    useCaptureInterfaces,
    useStartLiveCapture,
    useStopCapture,
} from '#front/pages/capture/hooks/use-capture'
import {
    buildLiveCaptureSource,
    type LiveInterfaceSettings,
} from '#front/pages/home/live-capture-options'

const defaultInterfaceSettings: LiveInterfaceSettings = {
    promiscuous: true,
    monitorMode: false,
    linkType: null,
    timestampType: null,
}

function sourceSelection(session?: CaptureSession) {
    if (session?.source._tag !== 'Live') return {}
    return Object.fromEntries(
        session.source.interfaces.map((item) => [
            item.name,
            {
                promiscuous: item.promiscuous,
                monitorMode: item.monitorMode,
                linkType: item.linkType,
                timestampType: item.timestampType,
            },
        ]),
    )
}

export function CaptureControlBar({
    session,
    following,
    onFollowingChange,
}: {
    session?: CaptureSession
    following?: boolean
    onFollowingChange?: (following: boolean) => void
}) {
    const navigate = useNavigate()
    const interfaces = useCaptureInterfaces()
    const start = useStartLiveCapture()
    const stop = useStopCapture(session?.captureId ?? '')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [selected, setSelected] = useState<Record<string, LiveInterfaceSettings>>(() =>
        sourceSelection(session),
    )
    const [bpfFilter, setBpfFilter] = useState(
        session?.source._tag === 'Live' ? session.source.bpfFilter : '',
    )
    const [snaplen, setSnaplen] = useState(
        session?.source._tag === 'Live' ? session.source.snaplen : 65_535,
    )
    const [bufferMiB, setBufferMiB] = useState(
        session?.source._tag === 'Live'
            ? Math.round(session.source.pcapBufferSizeBytes / 1024 / 1024)
            : 16,
    )
    const [ringSlots, setRingSlots] = useState(
        session?.source._tag === 'Live' ? session.source.ringSlots : 2048,
    )
    const isDesktop = typeof window !== 'undefined' && Boolean(window.pruftnet)
    const titlebarTarget = useContext(DesktopTitlebarTarget)
    const active = session?.state === 'starting' || session?.state === 'running'
    const locked = Boolean(session)
    const selectedNames = Object.keys(selected)

    function toggleInterface(name: string) {
        if (locked) return
        setSelected((current) => {
            if (!current[name]) return { ...current, [name]: defaultInterfaceSettings }
            const next = { ...current }
            delete next[name]
            return next
        })
    }

    function updateInterface(name: string, change: Partial<LiveInterfaceSettings>) {
        if (locked) return
        setSelected((current) => ({
            ...current,
            [name]: { ...(current[name] ?? defaultInterfaceSettings), ...change },
        }))
    }

    async function startCapture() {
        try {
            const next = await start.mutateAsync(
                buildLiveCaptureSource(selected, { bpfFilter, snaplen, bufferMiB, ringSlots }),
            )
            queryClient.setQueryData(captureKeys.session(next.captureId), next)
            await navigate({ to: '/capture/$captureId', params: { captureId: next.captureId } })
        } catch (error) {
            if (
                typeof error === 'object' &&
                error !== null &&
                '_tag' in error &&
                error._tag === 'CaptureAlreadyRunning' &&
                'activeCaptureId' in error &&
                typeof error.activeCaptureId === 'string'
            ) {
                await navigate({
                    to: '/capture/$captureId',
                    params: { captureId: error.activeCaptureId },
                })
            } else setSettingsOpen(true)
        }
    }

    const followControl =
        following !== undefined && onFollowingChange ? (
            <Button variant="ghost" onClick={() => onFollowingChange(!following)}>
                {following ? <Pause /> : <Play />}
                {following ? 'Pause tail' : 'Follow tail'}
            </Button>
        ) : null
    const lifecycleControls = (
        <div
            className={
                isDesktop
                    ? 'flex min-w-0 flex-1 items-center gap-2'
                    : 'bg-background flex h-10 shrink-0 items-center gap-2 border-b px-3'
            }
        >
            <InterfaceSelector
                interfaces={interfaces.data ?? []}
                selected={selected}
                loading={interfaces.isPending}
                disabled={locked}
                onToggle={toggleInterface}
                onRefresh={() => void interfaces.refetch()}
            />
            <Button
                size="icon"
                variant="outline"
                aria-label="Capture settings"
                onClick={() => setSettingsOpen(true)}
            >
                <Settings2 />
            </Button>
            {active ? (
                <Button
                    variant="destructive"
                    onClick={() => stop.mutate()}
                    disabled={stop.isPending}
                >
                    <Square />
                    {stop.isPending ? 'Stopping...' : 'Stop'}
                </Button>
            ) : session ? null : (
                <Button
                    onClick={() => void startCapture()}
                    disabled={selectedNames.length === 0 || start.isPending}
                >
                    {start.isPending ? 'Starting...' : 'Start capture'}
                </Button>
            )}
            {!isDesktop ? followControl : null}
            {interfaces.error ? (
                <span className="text-destructive truncate text-xs" role="alert">
                    Interfaces unavailable
                </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
                <span
                    className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : session?.state === 'failed' ? 'bg-destructive' : 'bg-muted-foreground/40'}`}
                />
                <span className="text-muted-foreground text-xs uppercase">
                    {session?.state ?? 'idle'}
                </span>
            </div>
        </div>
    )

    return (
        <>
            {isDesktop
                ? titlebarTarget
                    ? createPortal(lifecycleControls, titlebarTarget)
                    : null
                : lifecycleControls}
            {isDesktop && followControl ? (
                <div className="bg-background flex h-10 shrink-0 items-center border-b px-3">
                    {followControl}
                </div>
            ) : null}
            <CaptureSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                interfaces={interfaces.data ?? []}
                selected={selected}
                locked={locked}
                bpfFilter={bpfFilter}
                onBpfFilterChange={setBpfFilter}
                snaplen={snaplen}
                onSnaplenChange={setSnaplen}
                bufferMiB={bufferMiB}
                onBufferMiBChange={setBufferMiB}
                ringSlots={ringSlots}
                onRingSlotsChange={setRingSlots}
                onInterfaceChange={updateInterface}
                error={start.error ?? stop.error}
            />
        </>
    )
}

function InterfaceSelector({
    interfaces,
    selected,
    loading,
    disabled,
    onToggle,
    onRefresh,
}: {
    interfaces: readonly CaptureInterface[]
    selected: Readonly<Record<string, LiveInterfaceSettings>>
    loading: boolean
    disabled: boolean
    onToggle: (name: string) => void
    onRefresh: () => void
}) {
    const names = Object.keys(selected)
    return (
        <Popover>
            <PopoverTrigger
                disabled={disabled}
                render={<Button variant="outline" className="w-64 justify-between font-normal" />}
            >
                <span className="truncate">
                    {loading
                        ? 'Loading interfaces...'
                        : names.length === 0
                          ? 'Select interfaces'
                          : names.length === 1
                            ? names[0]
                            : `${names.length} interfaces selected`}
                </span>
                <ChevronDown className="text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 gap-1 p-0">
                <Command>
                    <CommandInput className="text-sm" placeholder="Search interfaces..." />
                    <CommandList>
                        <CommandEmpty>No capture interface found.</CommandEmpty>
                        <CommandGroup heading="Capture interfaces">
                            {interfaces.map((item) => (
                                <CommandItem
                                    key={item.name}
                                    value={`${item.name} ${item.description}`}
                                    data-checked={Boolean(selected[item.name])}
                                    onSelect={() => onToggle(item.name)}
                                    className="min-h-9 text-sm"
                                >
                                    <Checkbox
                                        checked={Boolean(selected[item.name])}
                                        tabIndex={-1}
                                        aria-hidden="true"
                                    />
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <code>{item.name}</code>
                                            {item.isLoopback ? (
                                                <span className="text-muted-foreground text-xs uppercase">
                                                    loopback
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="text-muted-foreground truncate text-xs">
                                            {item.description || 'No description'}
                                        </p>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                    <Button variant="ghost" className="m-1 justify-start" onClick={onRefresh}>
                        <RefreshCw /> Refresh interfaces
                    </Button>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

function CaptureSettingsDialog({
    open,
    onOpenChange,
    interfaces,
    selected,
    locked,
    bpfFilter,
    onBpfFilterChange,
    snaplen,
    onSnaplenChange,
    bufferMiB,
    onBufferMiBChange,
    ringSlots,
    onRingSlotsChange,
    onInterfaceChange,
    error,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    interfaces: readonly CaptureInterface[]
    selected: Readonly<Record<string, LiveInterfaceSettings>>
    locked: boolean
    bpfFilter: string
    onBpfFilterChange: (value: string) => void
    snaplen: number
    onSnaplenChange: (value: number) => void
    bufferMiB: number
    onBufferMiBChange: (value: number) => void
    ringSlots: number
    onRingSlotsChange: (value: number) => void
    onInterfaceChange: (name: string, change: Partial<LiveInterfaceSettings>) => void
    error?: unknown
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Capture settings</DialogTitle>
                    <DialogDescription>
                        Configure packet acquisition before starting. Active capture settings are
                        read-only.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-5">
                    <SettingsSection
                        title="Capture filter"
                        description="Applied by libpcap before packets enter the application."
                    >
                        <Label htmlFor="capture-filter">BPF expression</Label>
                        <Input
                            id="capture-filter"
                            value={bpfFilter}
                            disabled={locked}
                            onChange={(event) => onBpfFilterChange(event.target.value)}
                            placeholder="tcp port 443"
                            className="font-mono"
                        />
                    </SettingsSection>

                    <SettingsSection
                        title="Interfaces"
                        description="Link and timestamp options are resolved from each interface's capabilities."
                    >
                        {Object.keys(selected).length === 0 ? (
                            <p className="text-muted-foreground text-xs">
                                Select at least one interface from the toolbar.
                            </p>
                        ) : (
                            Object.entries(selected).map(([name, settings]) => (
                                <InterfaceSettings
                                    key={name}
                                    item={interfaces.find((item) => item.name === name)}
                                    name={name}
                                    settings={settings}
                                    locked={locked}
                                    onChange={(change) => onInterfaceChange(name, change)}
                                />
                            ))
                        )}
                    </SettingsSection>

                    <SettingsSection
                        title="Buffers"
                        description="Memory is bounded again by the backend and native worker."
                    >
                        <div className="grid gap-3 sm:grid-cols-3">
                            <NumberField
                                label="Snapshot bytes"
                                value={snaplen}
                                min={64}
                                max={262144}
                                disabled={locked}
                                onChange={onSnaplenChange}
                            />
                            <NumberField
                                label="Kernel buffer MiB"
                                value={bufferMiB}
                                min={1}
                                max={512}
                                disabled={locked}
                                onChange={onBufferMiBChange}
                            />
                            <NumberField
                                label="Ring slots"
                                value={ringSlots}
                                min={64}
                                max={262144}
                                disabled={locked}
                                onChange={onRingSlotsChange}
                            />
                        </div>
                    </SettingsSection>
                    {error ? <BasicErrorAlert error={error} /> : null}
                </div>
                <DialogFooter showCloseButton />
            </DialogContent>
        </Dialog>
    )
}

function InterfaceSettings({
    item,
    name,
    settings,
    locked,
    onChange,
}: {
    item?: CaptureInterface
    name: string
    settings: LiveInterfaceSettings
    locked: boolean
    onChange: (change: Partial<LiveInterfaceSettings>) => void
}) {
    const capabilities = useQuery({
        ...captureCapabilitiesOptions(name, settings.monitorMode),
        enabled: Boolean(item),
    })
    const monitorCapabilities = useQuery({
        ...captureCapabilitiesOptions(name, true),
        enabled: Boolean(capabilities.data?.canSetMonitorMode),
    })
    const monitorSupported = monitorCapabilities.data?.linkTypes.some(
        (linkType) => linkType.parserSupported,
    )
    return (
        <div className="border-border grid gap-3 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[1fr_auto]">
            <div>
                <code className="text-xs font-medium">{name}</code>
                <p className="text-muted-foreground text-xs">
                    {item?.description || 'Capture interface'}
                </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <ToggleSetting
                    label="Promiscuous"
                    checked={settings.promiscuous}
                    disabled={locked}
                    onChange={(checked) => onChange({ promiscuous: checked })}
                />
                {monitorSupported ? (
                    <ToggleSetting
                        label="Monitor"
                        checked={settings.monitorMode}
                        disabled={locked}
                        onChange={(checked) =>
                            onChange({ monitorMode: checked, linkType: null, timestampType: null })
                        }
                    />
                ) : null}
                <NativeSelect
                    disabled={locked || !capabilities.data}
                    aria-label={`Link type for ${name}`}
                    value={settings.linkType === null ? '' : String(settings.linkType)}
                    onChange={(event) =>
                        onChange({
                            linkType: event.target.value ? Number(event.target.value) : null,
                        })
                    }
                >
                    <NativeSelectOption value="">DLT: Auto</NativeSelectOption>
                    {capabilities.data?.linkTypes
                        .filter((item) => item.parserSupported)
                        .map((item) => (
                            <NativeSelectOption key={item.value} value={item.value}>
                                {item.name}
                            </NativeSelectOption>
                        ))}
                </NativeSelect>
                <NativeSelect
                    disabled={locked || !capabilities.data}
                    aria-label={`Timestamp source for ${name}`}
                    value={settings.timestampType ?? ''}
                    onChange={(event) => onChange({ timestampType: event.target.value || null })}
                >
                    <NativeSelectOption value="">Timestamp: Auto</NativeSelectOption>
                    {capabilities.data?.timestampTypes.map((item) => (
                        <NativeSelectOption key={item.value} value={item.name}>
                            {item.name}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
        </div>
    )
}

function SettingsSection({
    title,
    description,
    children,
}: {
    title: string
    description: string
    children: ReactNode
}) {
    return (
        <section className="space-y-3">
            <div className="border-border border-b pb-2">
                <h3 className="text-xs font-semibold">{title}</h3>
                <p className="text-muted-foreground text-xs">{description}</p>
            </div>
            {children}
        </section>
    )
}

function ToggleSetting({
    label,
    checked,
    disabled,
    onChange,
}: {
    label: string
    checked: boolean
    disabled: boolean
    onChange: (checked: boolean) => void
}) {
    return (
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
            {label}
            <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
        </label>
    )
}

function NumberField({
    label,
    value,
    min,
    max,
    disabled,
    onChange,
}: {
    label: string
    value: number
    min: number
    max: number
    disabled: boolean
    onChange: (value: number) => void
}) {
    return (
        <label className="text-muted-foreground space-y-1 text-xs">
            {label}
            <Input
                type="number"
                value={value}
                min={min}
                max={max}
                step={1}
                disabled={disabled}
                onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isFinite(next))
                        onChange(Math.min(max, Math.max(min, Math.round(next))))
                }}
                className="font-mono"
            />
        </label>
    )
}
