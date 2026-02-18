import { AppSidebar, type SidebarConfigType } from './sidebar-config'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Separator,
} from '../../atoms'
import { ThemeToggle } from '../../molecules'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '../../organisms'
import { cn } from '@repo/utils'
import { ComponentPropsWithoutRef } from 'react'

export type BreadcrumbItem = {
    title: string
    href?: string
}

export type LayoutDashboardProps = {
    sidebarConfig: SidebarConfigType
    breadcrumbs?: BreadcrumbItem[]
} & ComponentPropsWithoutRef<'main'>

export function DashboardLayout(props: LayoutDashboardProps) {
    const { children, className, sidebarConfig, breadcrumbs = [], ...rest } = props
    return (
        <SidebarProvider defaultOpen={false}>
            <AppSidebar config={sidebarConfig} />
            <SidebarInset className="relative">
                <header
                    className={cn(
                        'gap-2 border-b px-4',
                        'border-border flex shrink-0 items-center justify-between',
                        'h-16 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12',
                        'transition-[height,width] ease-linear',
                        'bg-background w-full',
                    )}
                >
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                {breadcrumbs.map((item, index) => {
                                    const isLast = index === breadcrumbs.length - 1
                                    return (
                                        <div key={item.title} className="flex items-center">
                                            <BreadcrumbItem className="hidden md:block">
                                                {isLast ? (
                                                    <BreadcrumbPage>{item.title}</BreadcrumbPage>
                                                ) : (
                                                    <BreadcrumbLink href={item.href}>
                                                        {item.title}
                                                    </BreadcrumbLink>
                                                )}
                                            </BreadcrumbItem>
                                            {!isLast && (
                                                <BreadcrumbSeparator className="ml-2 hidden md:block" />
                                            )}
                                        </div>
                                    )
                                })}
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    <ThemeToggle className="ml-auto" />
                </header>
                <main
                    className={cn(
                        className,
                        'h-[calc(100vh-4rem)] group-has-data-[collapsible=icon]/sidebar-wrapper:h-[calc(100vh-3rem)]',
                        'transition-[padding-top,height,width] ease-linear',
                    )}
                    {...rest}
                >
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
