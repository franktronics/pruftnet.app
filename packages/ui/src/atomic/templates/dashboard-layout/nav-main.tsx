import { ChevronRight, type LucideIcon } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../atoms'
import {
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '../../organisms'
import { cn } from '@repo/utils'
import { Link, useLocation } from '@tanstack/react-router'

export function NavMain({
    items,
    ...props
}: {
    items: {
        title: string
        url: string
        icon?: LucideIcon
        isActive?: boolean
        items?: {
            title: string
            url: string
        }[]
    }[]
}) {
    const location = useLocation()

    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map((item) => {
                        const isActive = location.pathname === item.url
                        return (
                            <Collapsible
                                key={item.title}
                                asChild
                                defaultOpen={item.isActive}
                                className="group/collapsible"
                            >
                                <SidebarMenuItem>
                                    <CollapsibleTrigger asChild>
                                        <SidebarMenuButton
                                            tooltip={item.title}
                                            asChild
                                            className={cn({
                                                'bg-primary text-primary-foreground hover:bg-primary! hover:text-primary-foreground!':
                                                    isActive,
                                            })}
                                        >
                                            <Link to={item.url}>
                                                {item.icon && <item.icon className="h-5! w-5!" />}
                                                <span>{item.title}</span>
                                                <ChevronRight
                                                    className={cn(
                                                        'ml-auto transition-transform duration-200',
                                                        {
                                                            'group-data-[state=open]/collapsible:rotate-90':
                                                                item.items && item.items.length > 0,
                                                            hidden:
                                                                !item.items ||
                                                                item.items.length === 0,
                                                        },
                                                    )}
                                                />
                                            </Link>
                                        </SidebarMenuButton>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent
                                        className={cn({ hidden: item.items?.length === 0 })}
                                    >
                                        <SidebarMenuSub>
                                            {item.items?.map((subItem) => (
                                                <SidebarMenuSubItem key={subItem.title}>
                                                    <SidebarMenuSubButton asChild>
                                                        <Link to={subItem.url}>
                                                            <span>{subItem.title}</span>
                                                        </Link>
                                                    </SidebarMenuSubButton>
                                                </SidebarMenuSubItem>
                                            ))}
                                        </SidebarMenuSub>
                                    </CollapsibleContent>
                                </SidebarMenuItem>
                            </Collapsible>
                        )
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    )
}
