import type { ComponentProps } from 'react'

type StepsComponentsProps = {} & ComponentProps<'div'>
export const StepsComponents = (props: StepsComponentsProps) => {
    const { ...rest } = props
    return <div {...rest}>Steps Components Component</div>
}
