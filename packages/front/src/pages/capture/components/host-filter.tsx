import type { HostBaseData } from '@repo/utils'
import { type ComponentProps } from 'react'

export type HostFilterProps = {
    hostData: Map<string, HostBaseData>
    filteredHost: Map<string, HostBaseData>
    onSetFilteredHost: (filtered: Map<string, HostBaseData>) => void
} & ComponentProps<'div'>

export const HostFilter = (props: HostFilterProps) => {
    const { ...rest } = props
    return <div {...rest}>test</div>
}
