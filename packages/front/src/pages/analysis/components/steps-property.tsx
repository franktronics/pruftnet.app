import type { ComponentProps } from 'react'

type StepsPropertyProps = {} & ComponentProps<'div'>
export const StepsProperty = (props: StepsPropertyProps) => {
    const { ...rest } = props
    return <div {...rest}>Steps Property Component</div>
}
