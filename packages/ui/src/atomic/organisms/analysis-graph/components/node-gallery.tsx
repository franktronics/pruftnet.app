import { Panel } from '@xyflow/react'
import { type ComponentProps } from 'react'

export type NodeGalleryProps = {} & ComponentProps<typeof Panel>

export const NodeGallery = (props: NodeGalleryProps) => {
    const { position = 'top-right', ...rest } = props
    return (
        <Panel position={position} {...rest}>
            OK
        </Panel>
    )
}
