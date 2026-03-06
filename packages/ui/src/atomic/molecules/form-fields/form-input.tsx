import { ComponentProps, useId } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel, Input } from '../../atoms'
import { useFieldContext } from './index'

export type FormInputProps = {
    label: string
    description?: string
} & ComponentProps<typeof Input>
export function FormInput(props: FormInputProps) {
    const { label, description, type, ...rest } = props
    const field = useFieldContext<string | number>()
    const fieldId = useId()

    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid

    return (
        <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
            <Input
                id={fieldId}
                value={field.state.value}
                name={field.name}
                type={type}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    if (type === 'number') {
                        const parsedValue = parseFloat(e.target.value)
                        field.handleChange(isNaN(parsedValue) ? '' : parsedValue)
                    } else {
                        field.handleChange(e.target.value)
                    }
                }}
                onBlur={field.handleBlur}
                aria-invalid={isInvalid}
                {...rest}
            />
            {!isInvalid && !!description ? (
                <FieldDescription>{description}</FieldDescription>
            ) : null}
            {isInvalid ? <FieldError errors={field.state.meta.errors} /> : null}
        </Field>
    )
}
