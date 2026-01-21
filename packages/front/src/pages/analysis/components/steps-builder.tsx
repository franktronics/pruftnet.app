import type { ComponentProps } from 'react'

type StepsBuilderProps = {} & ComponentProps<'div'>
export const StepsBuilder = (props: StepsBuilderProps) => {
    const { ...rest } = props
    return <div {...rest}>Steps Builder Component</div>
}
