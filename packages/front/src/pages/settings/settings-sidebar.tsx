import { Link, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useState } from 'react'

import {
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInput,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@repo/ui/organisms'

import { matchSettingsSections, settingsSectionGroups } from './settings-sections'

/** Sidebar contents shown in place of the main navigation while Settings is open. */
export function SettingsSidebar({ activeSectionId }: { activeSectionId: string | undefined }) {
    const navigate = useNavigate()
    const [search, setSearch] = useState('')
    const sections = matchSettingsSections(search)

    return (
        <>
            <SidebarHeader className="pt-2">
                <label className="relative block">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <SidebarInput
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        onKeyDown={(event) => {
                            const first = sections[0]
                            if (event.key !== 'Enter' || !first) return
                            void navigate({
                                to: '/settings/$section',
                                params: { section: first.id },
                            })
                        }}
                        placeholder="Search"
                        spellCheck={false}
                        className="pl-8"
                    />
                    <span className="sr-only">Search settings</span>
                </label>
            </SidebarHeader>
            <SidebarContent>
                {settingsSectionGroups.map((group) => {
                    const groupSections = sections.filter((section) => section.group === group)
                    if (groupSections.length === 0) return null
                    return (
                        <SidebarGroup key={group}>
                            <SidebarGroupLabel>{group}</SidebarGroupLabel>
                            <SidebarGroupContent>
                                <SidebarMenu>
                                    {groupSections.map((section) => {
                                        const Icon = section.icon
                                        return (
                                            <SidebarMenuItem key={section.id}>
                                                <SidebarMenuButton
                                                    isActive={section.id === activeSectionId}
                                                    render={
                                                        <Link
                                                            to="/settings/$section"
                                                            params={{ section: section.id }}
                                                        />
                                                    }
                                                >
                                                    <Icon />
                                                    <span>{section.label}</span>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        )
                                    })}
                                </SidebarMenu>
                            </SidebarGroupContent>
                        </SidebarGroup>
                    )
                })}
                {sections.length === 0 ? (
                    <p className="text-muted-foreground px-4 py-1.5 text-xs" role="status">
                        No settings match.
                    </p>
                ) : null}
            </SidebarContent>
        </>
    )
}
