import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Slider,
} from '@repo/ui'
import { useMemo, useState } from 'react'

import {
    emptyPacketDisplayFilters,
    parseConditions,
    secondsFromNumber,
    validatePacketDisplayFilters,
    type PacketDisplayFilters,
    type PacketParseCondition,
} from '#front/pages/capture/model/packet-filters'

export interface DisplayFilterProtocol {
    readonly id: number
    readonly displayName: string
}

export interface DisplayFilterInterface {
    readonly id: number
    readonly name: string
}

const conditionLabels: Record<PacketParseCondition, string> = {
    complete: 'Complete',
    partial: 'Partial',
    malformed: 'Malformed',
    resourceLimit: 'Resource limit',
}

export function AdvancedDisplayFilters({
    open,
    onOpenChange,
    filters,
    onApply,
    protocols,
    interfaces,
    maxTimeSeconds,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    filters: PacketDisplayFilters
    onApply: (filters: PacketDisplayFilters) => void
    protocols: readonly DisplayFilterProtocol[]
    interfaces: readonly DisplayFilterInterface[]
    maxTimeSeconds: number
}) {
    const [draft, setDraft] = useState(filters)
    const [validationError, setValidationError] = useState<string>()
    const sliderMax = Math.max(maxTimeSeconds, 1)
    const sliderStep = sliderMax <= 1 ? 0.000001 : Math.max(sliderMax / 1000, 0.001)
    const sliderValue = useMemo(() => {
        const min = draft.timeRange ? Number(draft.timeRange.minSeconds) : 0
        const max = draft.timeRange ? Number(draft.timeRange.maxSeconds) : sliderMax
        return [
            Number.isFinite(min) ? Math.max(0, Math.min(sliderMax, min)) : 0,
            Number.isFinite(max) ? Math.max(0, Math.min(sliderMax, max)) : sliderMax,
        ]
    }, [draft.timeRange, sliderMax])

    function updateTimeRange(minSeconds: string, maxSeconds: string) {
        setDraft((current) => ({ ...current, timeRange: { minSeconds, maxSeconds } }))
        setValidationError(undefined)
    }

    function toggleNumber(values: readonly number[], value: number): readonly number[] {
        return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
    }

    function toggleCondition(value: PacketParseCondition) {
        setDraft((current) => ({
            ...current,
            parseConditions: current.parseConditions.includes(value)
                ? current.parseConditions.filter((item) => item !== value)
                : [...current.parseConditions, value],
        }))
    }

    function reset() {
        setDraft({ ...emptyPacketDisplayFilters, search: filters.search })
        setValidationError(undefined)
    }

    function apply() {
        const error = validatePacketDisplayFilters(draft)
        if (error) {
            setValidationError(error)
            return
        }
        onApply(draft)
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Advanced filters</DialogTitle>
                    <DialogDescription>
                        Narrow the retained packet summaries without changing the capture.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <section className="space-y-3" aria-labelledby="time-range-title">
                        <div>
                            <h3 id="time-range-title" className="text-xs font-semibold">
                                Time range
                            </h3>
                            <p className="text-muted-foreground mt-1 text-[11px]">
                                Relative to the first retained packet. Leave the range untouched to
                                show every packet.
                            </p>
                        </div>
                        <Slider
                            min={0}
                            max={sliderMax}
                            step={sliderStep}
                            value={sliderValue}
                            aria-label="Packet time range"
                            onValueChange={(value) => {
                                if (!Array.isArray(value) || value.length < 2) return
                                updateTimeRange(
                                    secondsFromNumber(Number(value[0])),
                                    secondsFromNumber(Number(value[1])),
                                )
                            }}
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-time-min">From (seconds)</Label>
                                <Input
                                    id="packet-time-min"
                                    type="number"
                                    min="0"
                                    step="0.000001"
                                    value={draft.timeRange?.minSeconds ?? ''}
                                    onChange={(event) =>
                                        updateTimeRange(
                                            event.target.value,
                                            draft.timeRange?.maxSeconds ??
                                                secondsFromNumber(sliderMax),
                                        )
                                    }
                                    placeholder="0"
                                    aria-invalid={Boolean(validationError)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-time-max">To (seconds)</Label>
                                <Input
                                    id="packet-time-max"
                                    type="number"
                                    min="0"
                                    step="0.000001"
                                    value={draft.timeRange?.maxSeconds ?? ''}
                                    onChange={(event) =>
                                        updateTimeRange(
                                            draft.timeRange?.minSeconds ?? '0',
                                            event.target.value,
                                        )
                                    }
                                    placeholder={secondsFromNumber(sliderMax)}
                                    aria-invalid={Boolean(validationError)}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3 border-t pt-4" aria-labelledby="properties-title">
                        <h3 id="properties-title" className="text-xs font-semibold">
                            Packet properties
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-length-min">Minimum wire length</Label>
                                <Input
                                    id="packet-length-min"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={draft.minLength}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            minLength: event.target.value,
                                        }))
                                    }
                                    placeholder="Any length"
                                    aria-invalid={Boolean(validationError)}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-length-max">Maximum wire length</Label>
                                <Input
                                    id="packet-length-max"
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={draft.maxLength}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            maxLength: event.target.value,
                                        }))
                                    }
                                    placeholder="Any length"
                                    aria-invalid={Boolean(validationError)}
                                />
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <FilterCheckboxGroup
                                legend="Protocols"
                                emptyMessage="No protocol registry available"
                                items={protocols.map((protocol) => ({
                                    value: protocol.id,
                                    label: protocol.displayName,
                                }))}
                                selected={draft.protocolIds}
                                onToggle={(value) =>
                                    setDraft((current) => ({
                                        ...current,
                                        protocolIds: toggleNumber(current.protocolIds, value),
                                    }))
                                }
                            />
                            <FilterCheckboxGroup
                                legend="Interfaces"
                                emptyMessage="No interfaces available"
                                items={interfaces.map((item) => ({
                                    value: item.id,
                                    label: item.name,
                                }))}
                                selected={draft.interfaceIds}
                                onToggle={(value) =>
                                    setDraft((current) => ({
                                        ...current,
                                        interfaceIds: toggleNumber(current.interfaceIds, value),
                                    }))
                                }
                            />
                        </div>
                        <div>
                            <p className="mb-2 text-xs font-medium">Parse status</p>
                            <div className="grid grid-cols-2 gap-2">
                                {parseConditions.map((condition) => (
                                    <CheckboxLabel
                                        key={condition}
                                        checked={draft.parseConditions.includes(condition)}
                                        label={conditionLabels[condition]}
                                        onChange={() => toggleCondition(condition)}
                                    />
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3 border-t pt-4" aria-labelledby="endpoints-title">
                        <h3 id="endpoints-title" className="text-xs font-semibold">
                            Endpoints
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-source">Source contains</Label>
                                <Input
                                    id="packet-source"
                                    value={draft.source}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            source: event.target.value,
                                        }))
                                    }
                                    placeholder="Address or MAC"
                                    spellCheck={false}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="packet-destination">Destination contains</Label>
                                <Input
                                    id="packet-destination"
                                    value={draft.destination}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            destination: event.target.value,
                                        }))
                                    }
                                    placeholder="Address or MAC"
                                    spellCheck={false}
                                />
                            </div>
                        </div>
                    </section>
                </div>

                {validationError ? (
                    <p className="text-destructive text-xs" role="alert">
                        {validationError}
                    </p>
                ) : null}

                <DialogFooter className="border-t pt-4 sm:justify-between">
                    <Button type="button" variant="ghost" onClick={reset}>
                        Reset
                    </Button>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={apply}>
                            Apply filters
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function FilterCheckboxGroup({
    legend,
    emptyMessage,
    items,
    selected,
    onToggle,
}: {
    legend: string
    emptyMessage: string
    items: readonly { value: number; label: string }[]
    selected: readonly number[]
    onToggle: (value: number) => void
}) {
    return (
        <fieldset className="min-w-0">
            <legend className="mb-2 text-xs font-medium">{legend}</legend>
            <div className="bg-muted/30 max-h-28 space-y-1 overflow-y-auto rounded-md border p-2">
                {items.length === 0 ? (
                    <p className="text-muted-foreground text-[11px]">{emptyMessage}</p>
                ) : (
                    items.map((item) => (
                        <CheckboxLabel
                            key={item.value}
                            checked={selected.includes(item.value)}
                            label={item.label}
                            onChange={() => onToggle(item.value)}
                        />
                    ))
                )}
            </div>
        </fieldset>
    )
}

function CheckboxLabel({
    checked,
    label,
    onChange,
}: {
    checked: boolean
    label: string
    onChange: () => void
}) {
    return (
        <Label className="text-muted-foreground hover:text-foreground cursor-pointer gap-2 text-[11px]">
            <Checkbox checked={checked} onCheckedChange={onChange} />
            <span className="truncate">{label}</span>
        </Label>
    )
}
