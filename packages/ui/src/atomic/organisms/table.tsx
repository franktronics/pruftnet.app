'use client'

import * as React from 'react'

import { cn } from '@repo/utils'

/** Dense data-table header surface, shared with virtualized grids that cannot use `<table>`. */
const tableHeaderClassName =
    'bg-table-header text-table-header-foreground text-xs font-medium tracking-normal normal-case'

function Table({
    className,
    containerClassName,
    ...props
}: React.ComponentProps<'table'> & { containerClassName?: string }) {
    return (
        <div
            data-slot="table-container"
            className={cn('relative w-full overflow-x-auto', containerClassName)}
        >
            <table
                data-slot="table"
                className={cn('w-full caption-bottom text-xs', className)}
                {...props}
            />
        </div>
    )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
    return (
        <thead
            data-slot="table-header"
            className={cn(
                tableHeaderClassName,
                '[&_tr]:border-b [&_tr:hover]:bg-transparent',
                className,
            )}
            {...props}
        />
    )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
    return (
        <tbody
            data-slot="table-body"
            className={cn('[&_tr:last-child]:border-0', className)}
            {...props}
        />
    )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
    return (
        <tfoot
            data-slot="table-footer"
            className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
            {...props}
        />
    )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
    return (
        <tr
            data-slot="table-row"
            className={cn(
                'hover:bg-muted/45 has-aria-expanded:bg-muted/45 data-[state=selected]:bg-accent data-[state=selected]:text-accent-foreground border-b',
                className,
            )}
            {...props}
        />
    )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
    return (
        <th
            data-slot="table-head"
            className={cn(
                'h-8 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0',
                className,
            )}
            {...props}
        />
    )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
    return (
        <td
            data-slot="table-cell"
            className={cn(
                'h-[34px] px-2 py-0 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
                className,
            )}
            {...props}
        />
    )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
    return (
        <caption
            data-slot="table-caption"
            className={cn('text-muted-foreground mt-4 text-xs', className)}
            {...props}
        />
    )
}

export {
    tableHeaderClassName,
    Table,
    TableHeader,
    TableBody,
    TableFooter,
    TableHead,
    TableRow,
    TableCell,
    TableCaption,
}
