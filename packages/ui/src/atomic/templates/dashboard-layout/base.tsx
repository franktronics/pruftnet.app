import { AppSidebar } from './sidebar-config.tsx'
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

export type LayoutDashboardProps = {} & ComponentPropsWithoutRef<'main'>

export function DashboardLayout(props: LayoutDashboardProps) {
    const { children, className, ...rest } = props
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="relative">
                <header
                    className={cn(
                        'gap-2 border-b px-4',
                        'border-border flex shrink-0 items-center justify-between',
                        'h-16 group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12',
                        'transition-[height,width] ease-linear',
                        'bg-background w-full',
                    )}
                >
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-2 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block">
                                    <BreadcrumbLink href="#">
                                        Building Your Application
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator className="hidden md:block" />
                                <BreadcrumbItem>
                                    <BreadcrumbPage>Data Fetching</BreadcrumbPage>
                                </BreadcrumbItem>
                            </BreadcrumbList>
                        </Breadcrumb>
                    </div>
                    <ThemeToggle className="ml-auto" />
                </header>
                <main
                    className={cn(className, 'h-full', 'transition-[padding-top] ease-linear')}
                    {...rest}
                >
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
