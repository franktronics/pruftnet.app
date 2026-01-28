import { ComponentProps, useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel, Input } from '../../atoms'
import { useFieldContext } from '.'

export type FormInputProps = {
    label: string
    description?: string
} & ComponentProps<typeof Input>
export function FormInput(props: FormInputProps) {
    const { label, description, ...rest } = props
    const field = useFieldContext<string>()
    const fieldId = useId()

    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
        <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
            <Input
                id={fieldId}
                value={field.state.value}
                name={field.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.handleChange(e.target.value)
                }
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                {...rest}
            />
            {!isInvalid && !!description ? (
                <FieldDescription>Enter the starting IP address of the range.</FieldDescription>
            ) : null}
            {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
        </Field>
    )
}
