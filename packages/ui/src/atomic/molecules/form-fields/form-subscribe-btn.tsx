import { ComponentProps } from 'react'
import { Button } from '../../atoms'
import { useFormContext } from '.'

export type FormInputProps = {} & ComponentProps<typeof Button>
export function FormSubBtn(props: FormInputProps) {
    const { children, disabled, ...rest } = props
    const form = useFormContext()

    return (
        <form.Subscribe selector={(state) => state.isSubmitting || !state.isValid}>
            {(isToDisabled) => (
                <Button type="submit" disabled={isToDisabled || !!disabled} {...rest}>
                    {children}
                </Button>
            )}
        </form.Subscribe>
    )
}
