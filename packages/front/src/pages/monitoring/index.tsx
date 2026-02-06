import { useEffect, useMemo, useState } from 'react'
import { fetcher } from '../../config/client-trpc'
import { cn, useQueryFetcher } from '@repo/utils'
import {
    Badge,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Button,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@repo/ui/atoms'
import { Loader2 } from 'lucide-react'

const PAGE_SIZE = 20

const levelOptions = ['debug', 'info', 'warn', 'error'] as const
const sourceOptions = ['frontend', 'backend'] as const

type LogEntry = {
    id: number
    level: (typeof levelOptions)[number]
    source: (typeof sourceOptions)[number]
    title: string
    message: string
    context?: unknown
    createdAt: string | Date
}

const formatDate = (date: string | Date) =>
    new Date(date).toISOString().replace('T', ' ').slice(0, 19)

const stringifyContext = (context: unknown) => {
    try {
        return JSON.stringify(context, null, 2)
    } catch {
        return 'Unserializable context'
    }
}

const previewContext = (context: unknown) => {
    if (context === undefined || context === null) return '—'
    try {
        const str = JSON.stringify(context)
        return str.length > 80 ? `${str.slice(0, 80)}…` : str
    } catch {
        return 'context'
    }
}

function Monitoring() {
    const [page, setPage] = useState(1)
    const [level, setLevel] = useState<LogEntry['level'] | undefined>(undefined)
    const [source, setSource] = useState<LogEntry['source'] | undefined>(undefined)
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const skip = (page - 1) * PAGE_SIZE

    const { data, isFetching, isLoading } = useQueryFetcher<LogEntry[]>({
        procedure: fetcher.logger.list.query({
            level,
            source,
            take: PAGE_SIZE + 1,
            skip,
        }),
        enabled: true,
        retry: 0,
        popupOnError: true,
        queryKey: ['monitoring', page, level, source],
        staleTime: Infinity,
    })

    const [previousData, setPreviousData] = useState<LogEntry[] | undefined>(undefined)

    useEffect(() => {
        if (data) setPreviousData(data)
    }, [data])

    const logs = data ?? previousData ?? []
    const items = useMemo(() => logs.slice(0, PAGE_SIZE), [logs])
    const hasNext = logs.length > PAGE_SIZE

    useEffect(() => {
        setPage(1)
    }, [level, source])

    const openContextDialog = (log: LogEntry) => {
        if (!log.context) return
        setSelectedLog(log)
        setIsDialogOpen(true)
    }

    const closeContextDialog = () => {
        setSelectedLog(null)
        setIsDialogOpen(false)
    }

    return (
        <div className="flex h-full flex-col p-2">
            <div className="space-y-0.5 pb-4">
                <h2 className="text-2xl font-bold tracking-tight">Monitoring</h2>
                <p className="text-muted-foreground">Logs stream for frontend and backend.</p>
                <Separator className="my-4" />
            </div>

            <div className="flex h-full flex-col gap-3">
                <LogFilters
                    level={level}
                    source={source}
                    onLevelChange={setLevel}
                    onSourceChange={setSource}
                />

                <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <LogsTable
                        items={items}
                        isLoading={isLoading}
                        onOpenContext={openContextDialog}
                    />

                    <div className="flex items-center justify-between">
                        <div className="text-muted-foreground text-sm">
                            Page {page}
                            {isFetching && !isLoading ? ' · updating…' : ''}
                        </div>
                        <Pagination>
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={() =>
                                            page > 1 && setPage((p) => Math.max(1, p - 1))
                                        }
                                        className={cn({
                                            'pointer-events-none opacity-50': page === 1,
                                        })}
                                    />
                                </PaginationItem>
                                <PaginationItem>
                                    <PaginationNext
                                        onClick={() => hasNext && setPage((p) => p + 1)}
                                        className={cn({
                                            'pointer-events-none opacity-50': !hasNext,
                                        })}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                </div>
            </div>

            <ContextDialog open={isDialogOpen} log={selectedLog} onClose={closeContextDialog} />
        </div>
    )
}

type LogFiltersProps = {
    level?: LogEntry['level']
    source?: LogEntry['source']
    onLevelChange: (level: LogEntry['level'] | undefined) => void
    onSourceChange: (source: LogEntry['source'] | undefined) => void
}

const LogFilters = ({ level, source, onLevelChange, onSourceChange }: LogFiltersProps) => (
    <div className="bg-card/50 flex flex-wrap items-end gap-4 rounded-lg border p-3">
        <div className="space-y-2">
            <Label className="text-muted-foreground text-xs tracking-wide uppercase">Level</Label>
            <Select
                value={level ?? 'all'}
                onValueChange={(value) =>
                    onLevelChange(value === 'all' ? undefined : (value as LogEntry['level']))
                }
            >
                <SelectTrigger className="min-w-[160px]">
                    <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    {levelOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                            {opt}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>

        <div className="space-y-2">
            <Label className="text-muted-foreground text-xs tracking-wide uppercase">Source</Label>
            <Select
                value={source ?? 'all'}
                onValueChange={(value) =>
                    onSourceChange(value === 'all' ? undefined : (value as LogEntry['source']))
                }
            >
                <SelectTrigger className="min-w-[160px]">
                    <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    {sourceOptions.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                            {opt}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    </div>
)

type LogsTableProps = {
    items: LogEntry[]
    isLoading: boolean
    onOpenContext: (log: LogEntry) => void
}

const LogsTable = ({ items, isLoading, onOpenContext }: LogsTableProps) => (
    <div className="flex flex-col overflow-hidden rounded-lg border">
        <div className="scrollbar-thin flex-1 overflow-auto">
            <Table className="min-w-full text-sm">
                <TableHeader className="bg-muted sticky top-0 z-10">
                    <TableRow>
                        <TableHead className="w-44">Date</TableHead>
                        <TableHead className="w-20">Level</TableHead>
                        <TableHead className="w-24">Source</TableHead>
                        <TableHead className="w-56">Title</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead className="w-[24rem]">Context</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isLoading ? (
                        <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center">
                                <div className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading logs...
                                </div>
                            </TableCell>
                        </TableRow>
                    ) : items.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={6}
                                className="text-muted-foreground h-24 text-center text-sm"
                            >
                                No logs found for these filters.
                            </TableCell>
                        </TableRow>
                    ) : (
                        items.map((log) => (
                            <LogRow key={log.id} log={log} onOpenContext={onOpenContext} />
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    </div>
)

type LogRowProps = {
    log: LogEntry
    onOpenContext: (log: LogEntry) => void
}

const LogRow = ({ log, onOpenContext }: LogRowProps) => {
    const hasContext = log.context !== undefined && log.context !== null
    return (
        <TableRow
            className={cn('hover:bg-muted/60 transition-colors', { 'cursor-pointer': hasContext })}
            onDoubleClick={hasContext ? () => onOpenContext(log) : undefined}
        >
            <TableCell className="text-muted-foreground font-mono text-xs">
                {formatDate(log.createdAt)}
            </TableCell>
            <TableCell>
                <Badge
                    variant="outline"
                    className={cn('capitalize', {
                        'border-amber-500 text-amber-700': log.level === 'warn',
                        'border-red-500 text-red-700': log.level === 'error',
                        'border-sky-500 text-sky-700': log.level === 'info',
                        'border-muted-foreground text-muted-foreground': log.level === 'debug',
                    })}
                >
                    {log.level}
                </Badge>
            </TableCell>
            <TableCell>
                <Badge variant="secondary" className="capitalize">
                    {log.source}
                </Badge>
            </TableCell>
            <TableCell className="font-medium">{log.title}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{log.message}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
                {hasContext ? previewContext(log.context) : '—'}
            </TableCell>
        </TableRow>
    )
}

type ContextDialogProps = {
    open: boolean
    log: LogEntry | null
    onClose: () => void
}

const ContextDialog = ({ open, log, onClose }: ContextDialogProps) => (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
        <DialogContent className="w-[960px] max-w-[95vw]">
            <DialogHeader>
                <DialogTitle>{log?.title ?? 'Log context'}</DialogTitle>
                <DialogDescription className="text-muted-foreground flex flex-col gap-1 text-xs">
                    {log ? (
                        <>
                            <span>{formatDate(log.createdAt)}</span>
                            <span className="flex gap-2">
                                <Badge variant="outline" className="capitalize">
                                    {log.level}
                                </Badge>
                                <Badge variant="secondary" className="capitalize">
                                    {log.source}
                                </Badge>
                            </span>
                        </>
                    ) : null}
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
                {log?.message && (
                    <p className="text-foreground text-sm leading-relaxed">{log.message}</p>
                )}
                <div className="scrollbar-thin bg-muted max-h-96 overflow-auto rounded-md border p-3">
                    <pre className="text-xs leading-relaxed">
                        {log?.context ? stringifyContext(log.context) : 'No context available'}
                    </pre>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={onClose}>
                    Close
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
)

export default Monitoring
