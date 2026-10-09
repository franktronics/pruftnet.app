import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react'

import {
    applicationCommands,
    type ApplicationCommandId,
    type ApplicationCommandState,
    type ApplicationCommandStateSnapshot,
} from '@repo/shared/app-command'
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@repo/ui/organisms'

import '#front/config/desktop-api'
import { formatShortcut } from './shortcut-format'

type CommandExecutionSource = 'external' | 'palette'

export interface RegisteredApplicationCommand extends ApplicationCommandState {
    readonly execute: () => void | Promise<void>
}

interface ApplicationCommandContextValue {
    readonly register: (id: ApplicationCommandId, execute: () => void | Promise<void>) => () => void
    readonly removeState: (id: ApplicationCommandId) => void
    readonly updateState: (id: ApplicationCommandId, state: ApplicationCommandState) => void
    readonly execute: (id: ApplicationCommandId, source?: CommandExecutionSource) => Promise<void>
    readonly getState: (id: ApplicationCommandId) => ApplicationCommandState
}

const ApplicationCommandContext = createContext<ApplicationCommandContextValue | undefined>(
    undefined,
)

const blockingDialogSelector =
    '[data-slot="dialog-content"]:not(.application-command-palette), [data-slot="alert-dialog-content"]'

function hasBlockingDialog() {
    return document.querySelector(blockingDialogSelector) !== null
}

function shortcutMatches(event: KeyboardEvent, shortcut: string) {
    const parts = shortcut.toLowerCase().split('+')
    const key = parts.at(-1)
    const primary = parts.includes('mod')
    const platform = window.pruftnet?.platform ?? navigator.platform
    const isMac = platform === 'darwin' || /mac/i.test(platform)

    return (
        event.key.toLowerCase() === key?.toLowerCase() &&
        event.metaKey === (primary && isMac) &&
        event.ctrlKey === (primary && !isMac) &&
        event.altKey === parts.includes('alt') &&
        event.shiftKey === parts.includes('shift')
    )
}

const categoryLabels = {
    application: 'Application',
    capture: 'Capture',
    navigation: 'Navigation',
    view: 'View',
} as const

export function ApplicationCommandProvider({ children }: { readonly children: ReactNode }) {
    const handlers = useRef(new Map<ApplicationCommandId, () => void | Promise<void>>())
    const [states, setStates] = useState<ApplicationCommandStateSnapshot>({})
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [blockingDialogOpen, setBlockingDialogOpen] = useState(false)
    const [announcement, setAnnouncement] = useState('')

    const register = useCallback(
        (id: ApplicationCommandId, execute: () => void | Promise<void>) => {
            handlers.current.set(id, execute)
            return () => {
                if (handlers.current.get(id) === execute) handlers.current.delete(id)
            }
        },
        [],
    )
    const updateState = useCallback((id: ApplicationCommandId, state: ApplicationCommandState) => {
        setStates((current) => ({ ...current, [id]: state }))
    }, [])
    const removeState = useCallback((id: ApplicationCommandId) => {
        setStates((current) => {
            if (!(id in current)) return current
            const next = { ...current }
            delete next[id]
            return next
        })
    }, [])

    useEffect(() => {
        const update = () => setBlockingDialogOpen(hasBlockingDialog())
        const observer = new MutationObserver(update)
        observer.observe(document.body, { childList: true, subtree: true })
        update()
        return () => observer.disconnect()
    }, [])

    const getRawState = useCallback(
        (id: ApplicationCommandId): ApplicationCommandState => {
            if (id === 'command-palette') {
                return {
                    enabled: !hasBlockingDialog(),
                    disabledReason: hasBlockingDialog()
                        ? 'Close the current dialog first.'
                        : undefined,
                }
            }
            const state = states[id]
            if (!state) {
                return {
                    enabled: false,
                    disabledReason: 'Not available in the current context.',
                }
            }
            return {
                enabled: state.enabled,
                pending: state.pending,
                label: state.label,
                disabledReason: state.disabledReason,
            }
        },
        [states],
    )

    const getState = useCallback(
        (id: ApplicationCommandId): ApplicationCommandState => {
            const state = getRawState(id)
            if ((blockingDialogOpen || paletteOpen) && id !== 'command-palette') {
                return {
                    ...state,
                    enabled: false,
                    disabledReason: paletteOpen
                        ? 'Close the command palette first.'
                        : 'Close the current dialog first.',
                }
            }
            return state
        },
        [blockingDialogOpen, getRawState, paletteOpen],
    )

    const execute = useCallback(
        async (id: ApplicationCommandId, source: CommandExecutionSource = 'external') => {
            if (id === 'command-palette') {
                if (blockingDialogOpen) {
                    setAnnouncement('Close the current dialog before opening the command palette.')
                    return
                }
                setPaletteOpen((open) => !open)
                return
            }

            if ((blockingDialogOpen || paletteOpen) && source !== 'palette') {
                setAnnouncement(`${getRawState(id).label ?? 'Command'} is not available right now.`)
                return
            }

            const state = states[id]
            const handler = handlers.current.get(id)
            if (!handler || !state?.enabled || state.pending) {
                const definition = applicationCommands.find((candidate) => candidate.id === id)
                setAnnouncement(
                    state?.disabledReason ??
                        `${definition?.label ?? 'Command'} is no longer available.`,
                )
                return
            }

            if (source === 'palette') setPaletteOpen(false)
            try {
                await handler()
            } catch {
                const definition = applicationCommands.find((candidate) => candidate.id === id)
                setAnnouncement(`${definition?.label ?? 'Command'} failed.`)
            }
        },
        [blockingDialogOpen, getRawState, paletteOpen, states],
    )

    useEffect(() => {
        return window.pruftnet?.onApplicationCommand((id) => void execute(id))
    }, [execute])

    useEffect(() => {
        if (window.pruftnet) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.repeat) return
            const command = applicationCommands.find(
                (candidate) =>
                    candidate.shortcut &&
                    shortcutMatches(event, candidate.shortcut) &&
                    getState(candidate.id).enabled,
            )
            if (!command) return

            const state = getState(command.id)
            if (!state.enabled || state.pending) return
            event.preventDefault()
            void execute(command.id)
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [execute, getState])

    const snapshot = useMemo<ApplicationCommandStateSnapshot>(() => {
        return Object.fromEntries(
            applicationCommands.map(({ id }) => [id, getState(id)]),
        ) as ApplicationCommandStateSnapshot
    }, [getState])
    const serializedSnapshot = JSON.stringify(snapshot)
    const previousSnapshot = useRef('')

    useEffect(() => {
        if (!window.pruftnet || serializedSnapshot === previousSnapshot.current) return
        previousSnapshot.current = serializedSnapshot
        window.pruftnet.updateApplicationMenu(snapshot)
    }, [serializedSnapshot, snapshot])

    const context = useMemo<ApplicationCommandContextValue>(
        () => ({ register, removeState, updateState, execute, getState: getRawState }),
        [execute, getRawState, register, removeState, updateState],
    )

    return (
        <ApplicationCommandContext value={context}>
            {children}
            <ApplicationCommandPalette
                open={paletteOpen}
                onOpenChange={setPaletteOpen}
                getState={getRawState}
                execute={execute}
            />
            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {announcement}
            </div>
        </ApplicationCommandContext>
    )
}

function ApplicationCommandPalette({
    execute,
    getState,
    onOpenChange,
    open,
}: {
    readonly execute: ApplicationCommandContextValue['execute']
    readonly getState: ApplicationCommandContextValue['getState']
    readonly onOpenChange: (open: boolean) => void
    readonly open: boolean
}) {
    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Command Palette"
            description="Search for a Pruftnet command to run."
            className="application-command-palette sm:max-w-xl"
        >
            <CommandInput placeholder="Search commands…" autoFocus />
            <CommandList>
                <CommandEmpty>No matching commands.</CommandEmpty>
                {Object.entries(categoryLabels).map(([category, label]) => (
                    <CommandGroup key={category} heading={label}>
                        {applicationCommands
                            .filter(
                                (command) =>
                                    command.category === category &&
                                    command.id !== 'command-palette',
                            )
                            .map((command) => {
                                const state = getState(command.id)
                                return (
                                    <CommandItem
                                        key={command.id}
                                        value={[
                                            command.label,
                                            command.description,
                                            ...(command.keywords ?? []),
                                        ].join(' ')}
                                        disabled={!state.enabled || state.pending}
                                        onSelect={() => void execute(command.id, 'palette')}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">
                                                {state.label ?? command.label}
                                            </span>
                                            <span className="text-muted-foreground block truncate text-[0.6875rem]">
                                                {!state.enabled
                                                    ? state.disabledReason
                                                    : command.description}
                                            </span>
                                        </span>
                                        {command.shortcut ? (
                                            <CommandShortcut>
                                                {formatShortcut(command.shortcut)}
                                            </CommandShortcut>
                                        ) : null}
                                    </CommandItem>
                                )
                            })}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    )
}

export function useRegisterApplicationCommand(
    id: ApplicationCommandId,
    command: RegisteredApplicationCommand,
) {
    const context = useContext(ApplicationCommandContext)
    if (!context) throw new Error('Application commands require ApplicationCommandProvider')
    const { register, removeState, updateState } = context

    useEffect(() => register(id, command.execute), [command.execute, id, register])
    useEffect(
        () =>
            updateState(id, {
                enabled: command.enabled,
                pending: command.pending,
                label: command.label,
                disabledReason: command.disabledReason,
            }),
        [command.disabledReason, command.enabled, id, command.label, command.pending, updateState],
    )
    useEffect(() => () => removeState(id), [id, removeState])
}
